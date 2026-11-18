import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldAutoStart,TUTORIAL_KEY,TUTORIAL_STEPS} from '../src/tutorial.js';
test('walkthrough appears once and stays dismissed across later visits',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  assert.equal(shouldAutoStart(storage),true);storage.setItem(TUTORIAL_KEY,'seen');assert.equal(shouldAutoStart(storage),false);
  assert.equal(shouldAutoStart({getItem(){throw new Error('Storage disabled');}}),false);
  assert.ok(TUTORIAL_STEPS.some(s=>s.target==='.gallery-section'));
  assert.ok(TUTORIAL_STEPS.some(s=>s.target==='.export-actions'));
});
