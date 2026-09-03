'use strict';

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Atomically increments a named counter.
 *
 * findOneAndUpdate with $inc is a single document operation, so two concurrent
 * requests can never be handed the same number.
 */
async function nextSequence(key, session = undefined) {
  const query = Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  if (session) query.session(session);

  const counter = await query;
  return counter.seq;
}

module.exports = { Counter, nextSequence };
