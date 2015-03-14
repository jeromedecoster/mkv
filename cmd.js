#!/usr/bin/env node --harmony
"use strict"

const readdir = require('fs').readdirSync
const fmt = require('util').format
const exec = require('child_process').execSync
const parse = require('path').parse

const ffprobe = __dirname + '/ffprobe.exe'
const mkvextract = __dirname + '/mkvextract.exe'

let file = readdir('.').filter(e => /\.mkv$/i.test(e)).shift()
if (!file) abort('no file found')

let basename = parse(file).name
let streams = get()
streams = normalize(streams)
log(streams)
extract(streams)

function get() {
  let cmd = fmt('"%s" -show_streams -v quiet "%s"', ffprobe, file)
  return exec(cmd).toString()
}

function merge(a, b) {
  for (var k in b) a[k] = b[k]
  return a
}

function normalize(str) {
  return str
    .split('\n')
    .filter(line => [
        'index', 'codec_name', 'codec_type',
        'channels', 'width', 'height',
        'TAG:language', 'TAG:title'
      ].some(e => line.startsWith(e + '='))
    )
    .map(line => {
      let a = line.trim().split('=')
      var o = {}
      o[a.shift().split(':').pop()] = a.join('=')
      return o;
    }) 
    .reduce((array, object) => {
      if (object.hasOwnProperty('index')) return array.concat(object)
      let last = array[array.length - 1]
      merge(last, object)
      return array
    }, [])
    .map(object => {
      if (object.codec_type != 'video') {
        delete object.width
        delete object.height
      }
      if (object.codec_name == 'dca') {
        object.codec_name = 'dts'
      }
      return object
    })
}

function log(streams) {
  console.log('file: ' + file)
  let s
  streams.forEach(e => {
    s = fmt('stream: %s %s %s', e.index, e.codec_type, e.codec_name)
    switch (e.codec_type) {
      case 'video': s += fmt(' %sx%s', e.width, e.height); break
      case 'audio': s += fmt(' %s channels', e.channels); break
    }
    if (e.language) s += ' ' + e.language
    if (e.title) s += ' "' + e.title + '"'
    console.log(s)
  })
}

function extract(streams) {
  let dest, cmd
  streams
    .filter(e => /audio|subtitle/.test(e.codec_type))
    .forEach(e => {
      dest = basename + '.' + e.index
      if (e.language) dest += '.' + e.language
      dest += '.' + e.codec_name
      
      cmd = fmt('"%s" tracks "%s" %s:%s',
        mkvextract, file, e.index, dest)

      console.log('extract: ' + dest)
      exec(cmd)
    })
}

function abort(msg) {
  console.error(msg)
  process.exit(1)
}