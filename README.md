lognimbus
=========

Secure log transport in clouds. Lognimbus is essentially an
append-only file synchronization tool designed for accurate and fast
synchronization of log files. Lognimbus handles only the transport of
log files to a centralized destination and leaves the processing of
the log files for other tools.

Features
--------

 - **Reliable log delivery.** Log messages are not lost or duplicated
   due to network problems, hardware crashes, reboots, etc. Both
   servers and clients can crash, be killed or be restarted at any
   time without problems.
   
 - **Multiple independent destinations.** Lognimbus can deliver log
   messages simultaneously to several log destinations. Problems with
   a single delivery destination do not affect the delivery of log
   messages to other destinations. This allows all log messages to be
   immediately stored in geographically separate locations.
   
 - **Log file detection via glob patterns.** New log files are
   detected via configured glob patterns automatically. Log files can
   be gathered from several locations on the filesystem.
   
 - **Rapid detection of new log messages.** Detection of new log
   messages is triggered by `inotify` so new log messages will be
   delivered to log servers almost immediately.
   
 - **Log rotation is handled gracefully.** The assumption is that the
   log files to be synchronized will be rotated. Log rotation will not
   cause lost or duplicated log messages even if log file rotation
   happens when the client is not running.
   
 - **Already delivered log messages are immutable.** Any log messages
   that have been delivered can not be modified. This makes the log
   delivery suitable for audit logging as well.
   
 - **Log delivery is fast.** Log delivery progresses usually as fast
   as the filesystem or network can manage. There is no separate
   processing per log message, so the only limitation is the raw
   transfer speed. Achieving 100 MB/s is not uncommon.

 - **Log file format is arbitrary.** Log delivery works with all files
   that are strictly append-only. This means that in addition to
   normal text-based log files it is suitable for json-based log
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

Usage
-----

Configuration
-------------

License
-------

TBD
