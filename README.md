shaftlog
=========
[![Build Status](https://travis-ci.org/poplatek/shaftlog.svg?branch=master)](https://travis-ci.org/poplatek/shaftlog)
[![devDependency Status](https://david-dm.org/poplatek/shaftlog/dev-status.svg?theme=shields.io)](https://david-dm.org/poplatek/shaftlog#info=devDependencies)
[![NPM version](https://badge.fury.io/js/shaftlog.svg)](http://badge.fury.io/js/shaftlog)

**NOTE: Shaftlog is still in very early stages of development. This
notice will be changed when the software is deemed ready for general
use.**

Shaftlog is a secure, highly available, fault tolerant log file
synchronization tool. Shaftlog handles only the transport of log files
to a centralized destination and leaves the processing of the log
files for other tools.

Features
--------

 - **Reliable log delivery.** True once-and-only-once log message
   delivery. Log messages are not lost or duplicated due to network
   problems, hardware crashes, reboots, etc. Both servers and clients
   can crash, be killed or be restarted at any time without
   problems. Even if the log server gets restored from an earlier
   backup, no log messages are lost or duplicated if all the relevant
   log files are still present on log clients.
   
 - **Multiple independent destinations.** Shaftlog can deliver log
   messages simultaneously to several log destinations. Problems with
   a single delivery destination do not affect the delivery of log
   messages to other destinations. This allows all log messages to be
   immediately stored in geographically separate locations for maximum
   fault tolerance.
   
 - **Log file detection via glob patterns.** New log files are
   detected via configured glob patterns automatically. Log files can
   be gathered from several locations on the filesystem.
   
 - **Rapid detection of new log messages.** Detection of new log
   messages is triggered by `inotify` so new log messages will be
   delivered to log servers almost immediately. This means that even
   though the log synchronization is file based, the log stream can be
   viewed in real-time at the log server.
   
 - **Log rotation is handled gracefully.** The assumption is that the
   log files to be synchronized will be rotated. Log rotation will not
   cause lost or duplicated log messages even if log file rotation
   happens when the client is not running.
   
 - **Already delivered log messages are immutable.** Any log messages
   that have been delivered can not be modified. This combined with
   rapid detection of new log messages makes the log delivery uniquely
   suited for audit logging.
   
 - **Log delivery is fast.** Log delivery progresses usually as fast
   as the filesystem or network can manage. There is no separate
   processing per log message, so the only limitation is the raw
   transfer speed. Achieving 100 MB/s is not uncommon. The transport
   protocol is TCP so it will behave nicely with competing transfers.

 - **Log file format is arbitrary.** Log delivery works with all files
   that are strictly append-only. This means that in addition to
   normal text-based log files it is suitable for JSON-based log
   files, sudo I/O logs, MySQL binlogs, etc.
   
 - **PLANNED: Transport is encrypted and authenticated.** All
   connections use TLS for encryption and authentication. Both server
   only authentication and mutual authentication are supported.

 - **PLANNED: One-shot log synchronization.** Log files can be
   synchronized from the command-line as a single command which exists
   when all current log messages have been synchronized. This allows
   easy synchronization of log messages from backups or snapshots and
   safe server decommissioning ensuring no log messages have been
   left undelivered.

Installation
------------

TBD

Usage
-----

TBD

Configuration
-------------

The client is configured in `/etc/shaftlog-client-config.yaml`.

    # data directory where to hard link new log files
    # NOTE: must be on the same filesystem as all log files
    datadir: /var/log/shaftlog-client

    # log file to use for logs about synchronization
    logfile: /var/log/shaftlog-client.log

    # how often to scan for new log files in milliseconds
    scan_interval: 30000

    # how often to print status information
    status_interval: 300000

    # how often to re-stat one file in round robin to catch missed changes
    periodic_trigger_interval: 1000

    # list of paths to search for new log files
    # NOTE:
    # - destination filename is specified by "rename" key
    # - filenames may contain the following substitutions:
    #   {name}:  pattern name in this configuration file
    #   {time}:  time of file detection in milliseconds
    #   {atime}: time of last access in milliseconds
    #   {mtime}: time of last modification in milliseconds
    #   {ctime}: time of last (inode) change in milliseconds
    #   {ino}:   inode number
    #   {dev}:   device number
    # - default rename pattern: "{name}.{mtime}"
    # - regex substitution on filename can be specified by "regex_from"
    #   and "regex_to"
    # - exclude may be used to specify a glob expression of files to
    #   exclude from matching files
    scan_paths:
    - name: messages
      pattern: /var/log/messages*
      exclude: "*.{gz,bz2,xz}"
    - name: cron
      pattern: /var/log/cron*
      exclude: "*.{gz,bz2,xz}"
    - name: maillog
      pattern: /var/log/maillog*
      exclude: "*.{gz,bz2,xz}"
    - name: secure
      pattern: /var/log/secure*
      exclude: "*.{gz,bz2,xz}"
    - name: yum
      pattern: /var/log/yum.log*
      exclude: "*.{gz,bz2,xz}"
    - name: audit
      pattern: /var/log/audit/audit.log*
      exclude: "*.{gz,bz2,xz}"
    - name: dmesg
      pattern: /var/log/dmesg*
      exclude: "*.{gz,bz2,xz}"
    - name: cloudinit
      pattern: /var/log/cloud-init.log*
      exclude: "*.{gz,bz2,xz}"
    - name: shaftlog-client
      pattern: /var/log/shaftlog-client.log*
      exclude: "*.{gz,bz2,xz}"
    - name: shaftlog-server
      pattern: /var/log/shaftlog-server.log*
      exclude: "*.{gz,bz2,xz}"
    - name: sudo-io
      pattern: /var/log/sudo-io/**/{log,stderr,stdin,stdout,timing,ttyin,ttyout}
      regex_from: "^/var/log/sudo-io/(.*)"
      regex_to: "sudo-io/$1"

    # destinations to sync log files to
    # NOTE: urls must end in slash and may contain the following substitutions
    #   {hostname}: value returned by gethostname(2)
    #   {machine}:  UUID identifier for machine (/etc/machine-id or /var/lib/dbus/machine-id) 
    destinations:
    - url: http://log1.my.domain.invalid:10655/{hostname}/
    - url: http://log2.my.domain.invalid:10655/{hostname}/
    
The server is configured in `/etc/shaftlog-server-config.yaml`.

    # data directory where to store all synchronized log files
    datadir: /var/log/shaftlog-server

    # regex to validate uploaded file paths
    validate_regex: ^(\/([a-zA-Z0-9_-][a-zA-Z0-9._-]*)){1,}$

    # log file to use for logs about synchronization
    logfile: /var/log/shaftlog-server.log

    # port to listen for connections
    listen_port: 10655

    # address to bind to for connections
    bind_address: 0.0.0.0

How it works
------------

Shaftlog consists of two parts. The first part is log file discovery
which gathers all relevant log files under a single directory with
stable file names. The second part is essentially `rsync --append` on
stereoids which synchronizes any data appended to these files to log
servers.

### Discovery

The filesystem is periodically scanned for files matching a glob
pattern. For each matching file, the `inode` of the file is compared
to see if the same `inode` already exists in the centralized log file
directory. If the `inode` does not exist, the file is *hard linked* to
a temporary name to verify that there was not a race condition between
`fstat` and `link`, and then hard linked again to a stable name in the
centralized log file directory. This imposes the requirement that the
log files and the centralized log file directory must reside on the
same file system, but allows for reliable detection of rotated log
files.

### Synchronization

The synchronization uses HTTP and WebDAV protocols. For each file, the
file size on the server is queried with a standard HEAD request on the
path. Any missing data is then sent in chunks by doing a PUT requests
with a Content-Range header specifying the byte range to be appended
to the file. The server is a special purpose web server that allows
only HEAD and PUT requests and enforces that PUT requests can only
append to files and never overwrite existing data. The protocol has
been tested to be compatible with standard Apache WebDAV
implementation, even though it would be unsuitable for actual use. All
files are synchronized independently of each other, and normal HTTP
persistent connections are used to ensure that the server is not
overwhelmed by new connections.

Caveats
-------

 - The data directory must reside on the same filesystem as all the
   log files being synchronized. If there is a need to use separate
   partitions, use a separate client for each partition.
   
 - Log rotation via copy and truncate is not supported and will not be
   supported because there is no way to ensure that log messages have
   not been lost in between.

Motivation
----------

There are a number of great choices for centralized logging in cloud
environments, each offering very nice log processing and aggregation
features. However, picking between these choices becomes difficult
when including the log transport method in the comparison. Most do not
provide strict once-and-only-once semantics for log delivery in a
secure and fault tolerant fashion. Shaftlog can be used to solve the
log transport shortcomings they might have, allowing any one of these
tools to be used to process the delivered log files.

Other logging software
----------------------

 - [**FLUME**](http://flume.apache.org/)
 - [**Graylog2**](http://graylog2.org/)
 - [**logstash**](http://logstash.net/)
 - [**Scribe**](https://github.com/facebook/Scribe)
 - [**rsyslog**](http://www.rsyslog.com/)

License
-------

Copyright (c) 2013 Poplatek.

Licensed under the MIT license.
