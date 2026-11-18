export const TUTORIAL_KEY = 'ornl-door-signs-tutorial-v1';
export const TUTORIAL_STEPS = [
  { target: '.preview-panel', title: 'Welcome to Door Sign Studio', text: 'Create an 8.5 × 5-inch sign in a few steps. Your live canvas updates as you edit. You can close this tour at any time and reopen it with Tutorial.' },
  { target: '#sign-size', title: 'Start with the sign size', text: 'The first template is 8.5 × 5 inches in landscape orientation. The editor keeps the canvas and print files at this exact size.' },
  { target: '#title', title: 'Add your text', text: 'Edit the organization, title or name, role, group, and optional room. Use a line break for a two-line name. Long text fits automatically, and the title-size slider gives you more control.' },
  { target: '.gallery-section', title: 'Find the right image', text: 'Search by subject, image description, or Canto keyword. Combine Category and Science area to narrow the approved gallery, then select an image.' },
  { target: '#crop-controls', title: 'Frame the photograph', text: 'Drag the photo or use Horizontal, Vertical, and Zoom to choose the crop. Arrow keys also move the crop when the canvas has focus. Reset crop and Undo make it easy to try again.' },
  { target: '#quality', title: 'Check print quality', text: 'The print check verifies text fit and the photo’s effective resolution. If the photo falls below 300 dpi, zoom out before exporting. Always review your text and the final sign.' },
  { target: '.document-actions', title: 'Save your editable design', text: 'Save JSON keeps a portable, editable copy. Open design restores it later. A draft also autosaves on this device, while New design starts another sign.' },
  { target: '.export-actions', title: 'Download and print', text: 'Download a 300-dpi PNG or a PDF with an exact 8.5 × 5-inch page. Print the PDF at Actual size / 100%. If a download does not start, use the prepared-file save link. You’re ready to create your sign.' },
];

export function shouldAutoStart(storage) {
  try { return storage.getItem(TUTORIAL_KEY) !== 'seen'; } catch { return false; }
}

export function createTutorial({storage = localStorage, onChange = () => {}} = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'tutorial-dialog';
  dialog.setAttribute('aria-labelledby', 'tutorial-title');
  dialog.setAttribute('aria-describedby', 'tutorial-text');
  dialog.innerHTML = `<div class="tutorial-top"><span id="tutorial-progress"></span><button type="button" class="tool-button" aria-label="Close tutorial">Close</button></div><h2 id="tutorial-title"></h2><p id="tutorial-text"></p><div class="tutorial-actions"><button type="button" class="button secondary" data-tour="back">Back</button><button type="button" class="text-button" data-tour="skip">Skip tour</button><button type="button" class="button primary" data-tour="next">Next</button></div>`;
  document.body.append(dialog);
  let index = 0, target, previousFocus;
  const report = () => onChange({open:dialog.open, step:index, total:TUTORIAL_STEPS.length});
  function clearTarget() { target?.classList.remove('tutorial-target'); }
  function paint() {
    clearTarget();
    const step = TUTORIAL_STEPS[index];
    dialog.querySelector('#tutorial-progress').textContent = `Step ${index + 1} of ${TUTORIAL_STEPS.length}`;
    dialog.querySelector('#tutorial-title').textContent = step.title;
    dialog.querySelector('#tutorial-text').textContent = step.text;
    dialog.querySelector('[data-tour=back]').disabled = index === 0;
    dialog.querySelector('[data-tour=next]').textContent = index === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next';
    target = document.querySelector(step.target);
    target?.classList.add('tutorial-target');
    target?.scrollIntoView({block:'center', behavior:'instant'});
    const rect = target?.getBoundingClientRect();
    dialog.classList.toggle('tour-left', Boolean(rect && rect.left + rect.width / 2 > innerWidth / 2));
    dialog.classList.toggle('tour-top', Boolean(rect && rect.top + rect.height / 2 > innerHeight / 2));
    report();
  }
  function close() {
    if(!dialog.open)return;
    dialog.close(); clearTarget(); previousFocus?.focus({preventScroll:true}); report();
  }
  function start({automatic=false, step=0}={}) {
    if(automatic && !shouldAutoStart(storage))return false;
    if(!Number.isInteger(step)||step<0||step>=TUTORIAL_STEPS.length)throw new Error('Unknown tutorial step.');
    try { storage.setItem(TUTORIAL_KEY,'seen'); } catch { /* Tour remains manually usable. */ }
    previousFocus=document.activeElement;index=step;
    if(!dialog.open)dialog.showModal();paint();
    dialog.querySelector('[data-tour=next]').focus({preventScroll:true});return true;
  }
  function next(){if(index===TUTORIAL_STEPS.length-1)close();else{index++;paint();}}
  function back(){if(index>0){index--;paint();}}
  dialog.querySelector('[aria-label="Close tutorial"]').addEventListener('click',close);
  dialog.querySelector('[data-tour=skip]').addEventListener('click',close);
  dialog.querySelector('[data-tour=back]').addEventListener('click',back);
  dialog.querySelector('[data-tour=next]').addEventListener('click',next);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  return {start,close,next,back,getState:()=>({open:dialog.open,step:index,total:TUTORIAL_STEPS.length})};
}
