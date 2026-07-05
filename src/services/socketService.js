/**
 * src/services/socketService.js
 * Singleton Socket.io instance agar bisa dipakai dari service lain.
 */

'use strict';

let _io = null;

const setIO = (io) => {
  _io = io;
};

const getIO = () => {
  if (!_io) throw new Error('Socket.io belum diinisialisasi. Panggil setIO(io) terlebih dahulu.');
  return _io;
};

/**
 * Emit event ke semua client yang terkoneksi.
 * @param {string} event   Nama event
 * @param {*}      data    Payload
 */
const emit = (event, data) => {
  if (_io) {
    _io.emit(event, data);
  }
};

/**
 * Emit event ke room tertentu.
 */
const emitToRoom = (room, event, data) => {
  if (_io) {
    _io.to(room).emit(event, data);
  }
};

module.exports = { setIO, getIO, emit, emitToRoom };
