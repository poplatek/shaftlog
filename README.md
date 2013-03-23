lognimbus
=========

Secure log transport in clouds

Requirements
------------

 - **Absolutely reliable log delivery.** Log messages should be
   delivered once and only once, regardless of network errors, crashes
   and the like. Nobody likes duplicated log lines and it's not like
   solving this issue is impossible.

 - **Delivery to multiple destinations independently.** Hardware and
   network failures are to be assumed. No failure of a single device
   should ever cause data loss. This means that the log messages
   should be delivered simultaneously to multiple
   destinations. Problems at one delivery destination must not affect
   delivery to other destinations.

 - **Synchronization between log servers.** In case of failures, some
   log messages may only be delivered to one log server before the
   sending server has been shut down. It should also be possible to
   synchronize all log files between log servers to keep a full set of
   logs at each server.

 - **Rapid new log file detection via patterns.** New logfiles
   matching specified log file patterns should be detected rapidly
   after their creation. Ideally this should happen via `inotify`.

 - **Rapid detection of new log messages.** New messages in existing
   files should be detected rapidly and sent to log servers. Ideally
   this should happen via `inotify`. This facilitates real-time log
   monitoring and audit logging.

 - **Restarting logging must be safe.** The logging process can crash,
   or be killed. Messages that were written while the process was not
   running must not be lost and no messages should be duplicated in
   any circumstances.

 - **Reboots must be safe.** The server being logged, or the server
   receiving log files may be rebooted at any time and no log messages
   should be lost or duplicated because of this.

 - **Correct handling of rotated log files.** Log file rotation should
   be handled without loss of log messages. It is common that the
   renamed log file can still grow after being renamed before the
   process has a chance to reopen the logfile.

 - **Log rotation while logging is inactive must be safe.** Often in
   reboots log files may get rotated before the logging process is
   restarted. Log rotation while no process is running must not cause
   lost or duplicated log messages.

 - **One-shot log delivery from filesystem snapshots.** In case of
   some problems, there might not be a fully working operating system
   left after recovery. In these cases it should be possible to
   synchronize logfiles from a mounted partition as if they had come
   from the original server.

 - **Log delivery must not overwrite received data.** It must be
   impossible to overwrite already received log data. The system
   should be usable for audit logging where the system being logged
   may be compromised at any time. Any log messages already delivered
   must be safe from tampering.

 - **Log delivery must be encrypted and authenticated.** Log messages
   may be delivered over untrusted networks. All log messages must be
   encrypted to prevent eaves dropping. It must be possible to
   strongly authenticate both the client and the server, or only
   authenticate the server.

 - **Log file format must be arbitrary.** Normally logging is simply
   plain text files, but the system must support arbitrary log file
   formats that are append-only. This would include things like
   JSON-logfiles, protocol buffer logfiles, sudo I/O logs, MySQL
   binlogs.

 - **Log delivery must be fast.** There should be no reason why log
   delivery would be slower than simple file copying between
   servers. Matching the speed of `wget` should be the goal.
