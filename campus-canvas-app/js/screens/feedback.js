import { Store } from '../store.js';
import { Router } from '../router.js';
import { bottomNav, avatarBtn, toast, busy, esc } from '../ui.js';

const CATEGORIES = ['My submission', 'Voting', 'Prizes', 'Something else'];
let category = CATEGORIES[0];
let submitted = false;

export function feedback(root) {
  const p = Store.currentParticipant();
  if (submitted) { renderConfirmed(root, p); return; }

  root.innerHTML = `
    <div class="screen">
      <div class="topbar" style="padding-bottom:20px;">
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">Feedback</span>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:#8C8375;">We read everything</span>
          ${avatarBtn(p, Store.unreadCount() > 0)}
        </div>
      </div>
      <div class="scroll" style="padding:0 24px;">
        <h2 class="h-serif" style="font-size:29px; line-height:1.12; margin-bottom:12px;">Tell us what's not working.</h2>
        <p style="margin:0 0 28px; font-size:15.5px; font-weight:300; line-height:1.7; color:#5B5449;">Questions about the contest, a problem with an upload, or an idea for the program — it all lands with the ArtUP team.</p>

        <p class="eyebrow" style="letter-spacing:.20em;">What is this about?</p>
        <div id="cats" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:26px;">
          ${CATEGORIES.map((c) => `<span data-cat="${c}" style="height:36px; padding:0 15px; border-radius:18px; display:flex; align-items:center; font-size:13.5px; cursor:pointer; ${c === category ? 'background:#1B1916; color:#FBF8F2; font-weight:400;' : 'border:1px solid rgba(27,25,22,.18); font-weight:300; color:#4A443A;'}">${c}</span>`).join('')}
        </div>

        <p class="eyebrow" style="letter-spacing:.20em;">Your message</p>
        <div style="border-radius:16px; background:#FFFFFF; border:1px solid rgba(27,25,22,.12); padding:16px 18px 12px; margin-bottom:10px;">
          <textarea id="fb-msg" rows="5" maxlength="1000" placeholder="Write your message…" style="border:none; padding:0; margin-bottom:14px;"></textarea>
          <div style="display:flex; justify-content:flex-end; border-top:1px solid rgba(27,25,22,.08); padding-top:10px;">
            <span id="fb-count" style="font-size:13px; font-weight:300; color:#8C8375;">0 / 1000</span>
          </div>
        </div>

        <div style="border-radius:16px; background:#F2ECE0; padding:18px 20px; margin-bottom:26px;">
          <p class="eyebrow" style="margin-bottom:6px; letter-spacing:.18em;">Sending as</p>
          <p style="margin:0; font-size:15.5px; font-weight:300; color:#1B1916;">${esc(p.name)} · ${esc(p.email)}</p>
        </div>
      </div>
      <div style="padding:14px 24px 0;">
        <button class="btn btn-gold" id="send-fb">Send feedback</button>
        ${bottomNav('feedback')}
      </div>
    </div>`;

  root.querySelectorAll('[data-cat]').forEach((el) => {
    el.addEventListener('click', () => { category = el.dataset.cat; feedback(root); });
  });

  const msg = root.querySelector('#fb-msg');
  const count = root.querySelector('#fb-count');
  msg.addEventListener('input', () => { count.textContent = `${msg.value.length} / 1000`; });

  const sendBtn = root.querySelector('#send-fb');
  sendBtn.addEventListener('click', async () => {
    const text = msg.value.trim();
    if (!text) { toast('Add a message before sending.'); msg.focus(); return; }
    const restore = busy(sendBtn, 'Sending…');
    try {
      await Store.submitFeedback(category, text);
    } catch (err) {
      // FR-052: only acknowledge once the message is actually saved.
      restore();
      toast(`Couldn’t send: ${err.message}`, 3200);
      return;
    }
    submitted = true;
    feedback(root);
  });
}

function renderConfirmed(root, p) {
  root.innerHTML = `
    <div class="screen">
      <div class="scroll" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 32px;">
        <span style="width:56px; height:56px; border-radius:28px; background:#A6842C; display:block; margin-bottom:26px;"></span>
        <h2 class="h-serif" style="font-size:29px; line-height:1.15; margin-bottom:14px;">Got it — thank you.</h2>
        <p style="margin:0; max-width:280px; font-size:15.5px; font-weight:300; line-height:1.7; color:#5B5449;">Your message is with the ArtUP team. We reply by email when there's something to share.</p>
      </div>
      <div style="padding:20px 24px 34px;">
        <button class="btn btn-outline" id="fb-another">Send another message</button>
        ${bottomNav('feedback')}
      </div>
    </div>`;
  root.querySelector('#fb-another').addEventListener('click', () => { submitted = false; feedback(root); });
}
