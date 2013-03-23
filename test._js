var clie = require('./clie');

var path = '/boot/vmlinuz-3.2.0-3-amd64';
var remote_url = 'http://localhost/vmlinuz';

var local_size = clie.get_local_size(path, _);
var remote_size = clie.get_remote_size(remote_url, _);
while (local_size > remote_size) {
    remote_size = clie.send_piece(remote_url, path, remote_size, Math.min(5, local_size-remote_size), local_size, _);
}
console.log('done!');
