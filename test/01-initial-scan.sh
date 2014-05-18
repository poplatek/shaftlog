#!/bin/sh

set -e

cleanup() {
    rm -rf scandir datadir servdir client.log server.log client.yaml server.yaml a.txt b.txt
}
trap 'cleanup; exit' INT QUIT TERM

cleanup

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
sleep 2;
echo "bar" > scandir/test.1
sleep 2;

mkdir servdir
../shaftlog-server.js -dsf ./server.yaml & server_pid=$!
../shaftlog-client.js -dsf ./client.yaml & client_pid=$!

sleep 2

kill $client_pid
wait $client_pid
kill $server_pid
wait $server_pid

ls -i ./scandir | cut -d' ' -f1 | sort -n > a.txt
ls -i ./datadir | cut -d' ' -f1 | sort -n > b.txt

diff a.txt b.txt

diff -r ./datadir ./servdir/`hostname`-a/
diff -r ./datadir ./servdir/`hostname`-b/

cleanup
