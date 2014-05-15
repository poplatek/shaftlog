Changes
=======

0.0.3
-----
- Fix EEXIST race with directory creation.
- Normalize URI path before validation.
- Default stats interval is now 5 minutes.
- Add exclude option to patterns.
- Add validation_regex as a configurable option.
- Remove dependency on tea-error.
- Add stdout logging for debugging.
- Streamline source files at build time.
- Browserify all dependencies in to single files for easy install.

0.0.2
-----
- Support specifying destination filename via patterns and regex.
- Support sync filenames that have directory components.

0.0.1
-----

- Initial release.
