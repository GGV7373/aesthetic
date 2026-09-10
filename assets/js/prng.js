/* Deterministic randomness.
   Same seed => same quiz, which is what makes ?seed= able to replay a run. */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Short, readable seed string: 8 characters from an alphabet with no lookalikes. */
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function newSeedString() {
    var out = '';
    var bytes;
    if (global.crypto && global.crypto.getRandomValues) {
      bytes = new Uint8Array(8);
      global.crypto.getRandomValues(bytes);
    } else {
      bytes = [];
      for (var j = 0; j < 8; j++) bytes.push(Math.floor(Math.random() * 256));
    }
    for (var i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  }

  function normaliseSeed(str) {
    return String(str || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 16);
  }

  function rngFromSeed(seedString, salt) {
    return mulberry32(hashString(normaliseSeed(seedString) + '|' + (salt || '')));
  }

  /* Fisher-Yates with a supplied rng. Does not mutate the input. */
  function shuffle(list, rng) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  AQ.rng = {
    hashString: hashString,
    mulberry32: mulberry32,
    newSeedString: newSeedString,
    normaliseSeed: normaliseSeed,
    rngFromSeed: rngFromSeed,
    shuffle: shuffle
  };
})(typeof window !== "undefined" ? window : globalThis);
