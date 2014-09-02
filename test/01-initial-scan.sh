#!/bin/sh

set -e

client="$PWD"/../shaftlog-client.js
server="$PWD"/../shaftlog-server.js
tempdir=`mktemp --tmpdir -d shaftlog-test-tmp.XXXXXXXXXX`
client_pid=
server_pid=

cleanup() {
    if [ "x$server_pid" != "x" ]; then
        kill $server_pid || true
        wait $server_pid || true
        server_pid=
    fi
    if [ "x$client_pid" != "x" ]; then
        kill $client_pid || true
        wait $client_pid || true
        client_pid=
    fi
    rm -rf "$tempdir"
}
trap "cleanup" EXIT

cd "$tempdir"

cat <<EOF >./client.yaml
datadir: ./datadir
logfile: ./client.log
scan_paths:
- name: test
  pattern: ./scandir/test*
destinations:
- url: http://127.0.0.1:10655/{hostname}-a/
- url: http://127.0.0.1:10655/{hostname}-b/
EOF

cat <<EOF >./server.yaml
datadir: ./servdir
logfile: ./server.log
bind_address: 127.0.0.1
listen_port: 10655
EOF

mkdir scandir
mkdir datadir
echo "foo" > scandir/test
sleep 1;
echo "bar" > scandir/test.1

mkdir servdir
$server -dsf ./server.yaml & server_pid=$!
sleep 1
$client -dsf ./client.yaml & client_pid=$!
sleep 1

kill $client_pid
wait $client_pid
client_pid=
kill $server_pid
wait $server_pid
server_pid=

ls -i ./scandir | cut -d' ' -f1 | sort -n > a.txt
ls -i ./datadir | cut -d' ' -f1 | sort -n > b.txt

diff a.txt b.txt

diff -x '.*' -r ./datadir ./servdir/`hostname`-a/
diff -x '.*' -r ./datadir ./servdir/`hostname`-b/
