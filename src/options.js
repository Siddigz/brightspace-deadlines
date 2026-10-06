import { phoneSettings, setUp, upload } from './phone.js';
import { gistId } from './gist.js';

const form = document.getElementById('phone-form');
const status = document.getElementById('status');
const uploadBtn = document.getElementById('upload-btn');
const stopBtn = document.getElementById('stop-btn');

const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function show() {
  const phone = await phoneSettings();
  uploadBtn.hidden = stopBtn.hidden = !phone?.gistId;
  if (!phone?.gistId) {
    status.textContent = 'Not set up.';
    return;
  }
  form.gist.value = phone.gistId;
  status.innerHTML = `Gist ID for your phone: <b>${phone.gistId}</b>`
    + ` (<a href="https://gist.github.com/${phone.gistId}" target="_blank">view</a>)<br>`
    + (phone.error ? `Last upload failed: ${phone.error}` : phone.uploadedAt ? `Last uploaded ${when(phone.uploadedAt)}.` : '');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status.textContent = 'Saving…';
  try {
    await setUp(form.token.value.trim(), form.gist.value ? gistId(form.gist.value) : null);
    form.token.value = '';
  } catch (err) {
    status.textContent = `Couldn't set up: ${err.message}`;
    return;
  }
  show();
});

uploadBtn.addEventListener('click', async () => {
  status.textContent = 'Uploading…';
  await upload();
  show();
});

stopBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('phone');
  status.textContent = 'Stopped. The gist is still on GitHub; delete it there if you want it gone.';
  uploadBtn.hidden = stopBtn.hidden = true;
  form.gist.value = '';
});

show();
