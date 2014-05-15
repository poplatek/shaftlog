Shaftlog design
===============

This document outlines some of the design choices made in creating
shaftlog and presents the rationale behind those choices.

File based logging
------------------

Shaftlog is a tool for synchronizing logfiles from one server to
another. This is in contrast to a lot of other tools which are based
on delivering invidual log messages and creating a queue of log
messages.

This is because file based logging is often superior to the
alternatives in many ways:

- If durability is a desirable quality for log messages then the first
  thing that has to be done is to store a log message in persistent
  storage. This must be done regardless of the way log messages are
  delivered. For example, rsyslog has a disk based log queue for
  undelivered log messages, AMQP can persist messages to disk and
  logging to MySQL or PostgreSQL will write the inserted row to
  disk. Appending a log message to a file is the most straightforward
  way to persist it for durability.

- Almost none of the other log message transports offer reliable
  delivery, even for the local machine. Logging to syslog via UDP or
  /dev/log is not reliable - a burst of messages will lead to some
  messages being dropped. Neither is TCP as buffered messages will be
  lost on closed connections. File based logging has handed the data
  off to the kernel the moment a `write` call to a file descriptor
  completes. After this only a kernel crash or a hardware failure can
  prevent the log message to saved.

- Even the durable log transports usually promise durability only as
  far as message reception and not all the way to the persistence
  layer. This means that there is no way to ensure that a log message
  has been persisted before performing some operation, as required by
  some audit logs. File based logging can use `fsync` to ensure that
  the log lines have actually been persisted before performing an
  operation.

- If a daemon required to receive log messages there will always be
  some special cases where the daemon is not running. Even the system
  syslogd may crash at times, or be restarted for upgrades. During
  these times the logging system is unavailable and messages must be
  queued to preserve durability. File based logging is only
  unavailable if the disk is full - a condition where no logging
  solution can ensure the durability of log messages.

- When log messages are created faster than they can be persisted,
  either the machine will run out of memory or the application must
  block on logging. File based logging can naturally block the threads
  doing the logging on the operating system level, slowing the
  application down instead of generating an infinite memory backlog.

- Most log transports process log messages invidually with there being
  some overhead per each log message. This overhead is usually
  constant regardless of how many log messages are produced. In file
  based logging, writes to a file are already being buffered and
  written in batches so the file writes can go as fast as the
  underlying storage can store them.

- Many existing applications only support writing log messages to log
  files, so a good solution to handling log files must be implemented
  in any case.

Detecting Renamed Files
-----------------------

Log rotation is handled by renaming log files in most cases. If the
daemon is running, it can detect these rotations via inotify and keep
track which file is which. However, log rotation is often handled at
boot time, perhaps before the daemon is running - or there is always
the possibility of log files being rotated while the daemon has
crashed or is being upgraded.

This creates the need to reliably identify log files after log rotate
to know which files have already been transferred and which have
not. There are many solutions to this problem, but only a few of them
are reliable:

- Unreliable: Tracking filenames and knowing how they are rotated. Perhaps the
  most simplistic approach is to just know how each log file is being
  rotated and to support having files rotated only once between daemon
  restarts. However, this is very hard to get really reliable.

- Unreliable: Checksum on the first line in a log file. Most log files should
  probably have a timestamp on the first line, so a checksum on the
  first line (or first kilobyte) could function as a unique identifier
  for logfiles. However, there are times where almost the same data is
  logged to several files and the first line in each file might be
  identical. Also this does not work at all for logfiles which do not
  have timestamps.

- Unreliable: Record `inode` numbers. This is the approach taken by `logstash`. An
  inode number is unique within a filesystem, so a renamed file can
  reliably be detected by that. However, inodes are frequently used in
  a free list type of configuration. This means that if a file is
  deleted and a new one created immediately after, it will most likely
  get the same inode number as the deleted file. In addition to that,
  inode numbers are not persisted in many network filesystems.

- Reliable: Mark detected files with an UUID in `xattr`. If a
  filesystem supports extended attributes this is a nice place to
  store metadata about a file. An UUID stored in extended attributes
  follows the file around on all renames and sometimes even copies
  across filesystems. However, not all filesystems support extended
  attributes, or even if they do, user set extended attributes might
  not be enabled. Also, since a file may be renamed or deleted while
  the daemon is accessing it, finding the file with the correct UUID
  might be tricky. This means that the deamon has to keep file
  descriptors open for each log file it wants to track.

- Reliable: Hard link detected files to a separate directory. This is
  the approach taken by shaftlog. Every time a new file is detected,
  it is hardlinked to a separate directory, under a unique name. This
  unique name will stay stable through all file renames and even file
  deletion in the original directory. This means that the daemon can
  safely access the file without worrying about it being renamed or
  deleted. The daemon can also handle deletion when it is done with
  the file. In this case, `inode` numbers are a reliable indicator if
  a file is present in the separate directory as we can know that the
  inode cannot be reused as long as the file is not deleted in the
  separate directory. The inode lookup table can always be rebuilt at
  each daemon startup so inode numbers do not need to stay reliable
  over reboots.

Transport Protocol
------------------ 

The protocol used to deliver log messages from clients to server is
actually just standard HTTP 1.1. For each file the client will first
confirm the remote file size by issuing a standard HEAD request:

    --> HEAD /syslog.1400134706 HTTP/1.1
    <-- HTTP/1.1 200 OK
    <-- Content-Length: 124424

After this the client will append to the file in chunks, using
standard PUT requests with a content-range header:

    --> PUT /syslog.1400134706 HTTP/1.1
    --> Content-range: bytes 124424-124486/1302453
    <-- HTTP/1.1 204 No Content
    <-- Content-Length: 0

If there is any error, the client will reset back to doing a HEAD
request first to determine the remote file size. HTTP/1.1 connection
keepalive is used to make sure no new TCP connections need to be set
up per chunk.

In theory, this protocol allows the client to interoperate with any
WebDAV (or HTTP 1.1 PUT) enabled server implementation. However, for
the synchronization to be meaningful, the server must enforce that all
PUT requests will strictly append to the file and not overwrite any
older contents. Also the client will not issue any directory creation
commands, so if directories are used the server must automatically
make any necessary parent directories for the files.

Each file will be transferred invidually by the client to all log
destinations. There is no interaction between different log
destinations or different files to the same destination. For a single
file there is only a single request in flight at a time so logging
will naturally slow down to the pace at which the server is able to
accept data. Since it is customary for filesystems (atleast on
spinning disks) to take different amounts of time for writing to
different files (fragmentation, etc.) sending each log chunk
invidually also allows the filesystem to optimize the write order on
the disk for best possible throughput. This would not be possible if
all files would be appended at once by a single request.

Log integrity protection
------------------------

Log files are often used to investigate attacks or malicious
behavior. However, log files can easily be manipulated by such an
attacker. This creates the need to somehow ensure log integrity
against malicious changes by attackers. There are many approaches to
this:

- Cryptographic checksums on log files with the key stored
  locally. This is the first approach taken by many. Cryptographic
  checksums indeed do allow for detection of changes, but with the key
  stored locally nothing is preventing the attacker from just creating
  new checksums that match. There are many variants of this approach,
  but as long as nothing external is needed or produced, all the
  approaches are essentially equivalent. This may thwart simple minded
  attackers but offers no security better than obscurity.

- Cryptographic checksums on log files including external
  timestamps. This is the approach taken by rsyslog, using
  Guardtime. By incorporating external, verifiable, timestamps in to
  the log checksums, any regenerated log checksums can be detected as
  generated after the fact. This is an efficient approach to ensuring
  log file integrity, but it relies on an external 3rd party. This
  also only allows detection of modifications and does not preserve
  what the modified logs were.

- Cryptographic checksums on log files with a forward-secure key. This
  is the approach taken by systemd journal. By using a new key for
  each checksum generated by some one-way transform, and deleting the
  old key securely, there is no way for the attacker to retrieve the
  old key to be able to regenerate a checksum. This is an efficient
  approach to ensuring log file integrity, but it relies on the old
  key deletion to be reliable and it requires pretty complex
  cryptography to make the generated checksums easily verifiable on
  the server side. This also only allows detection of modifications
  and does not preserve what the modified logs were.

- Shipping the log files to a centralized log server, preventing
  modifications to already sent logs. This is the approach taken by
  many, and also shaftlog. By simply taking the logs to a centralized
  server in an append-only fashion, an attacker has no means to modify
  older logs. Log file alterations might not be even detected (if
  there are no special detection systems installed for this) as they
  are not possible. This is probably the simplest approach, but also
  the approach which provides the best protection of
  integrity. However, the downside is that it requires that the client
  has network connectivity to deliver the logs.
