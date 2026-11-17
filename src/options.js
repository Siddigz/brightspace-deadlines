import { phoneSettings, setUp, upload } from './phone.js';
import { repoName } from './repo.js';

const form = document.getElementById('phone-form');
const status = document.getElementById('status');
const uploadBtn = document.getElementById('upload-btn');
const stopBtn = document.getElementById('stop-btn');

const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function show() {
  const phone = await phoneSettings();
  uploadBtn.hidden = stopBtn.hidden = !phone?.repo;
  if (!phone?.repo) {
    status.textContent = 'Not set up.';
    return;
  }
  form.repo.value = phone.repo;
  status.innerHTML = `Sharing to <b>${phone.repo}</b>`
    + ` (<a href="https://github.com/${phone.repo}" target="_blank">view</a>).<br>`
    + (phone.error ? `Last upload failed: ${phone.error}` : phone.uploadedAt ? `Checked ${when(phone.uploadedAt)} (only sends what changed).` : '');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status.textContent = 'Saving…';
  try {
    await setUp(form.token.value.trim(), repoName(form.repo.value));
    form.token.value = '';
  } catch (err) {
    status.textContent = `Couldn't set up: ${err.message}`;
    return;
  }
  show();
});

uploadBtn.addEventListener('click', async () => {
  status.textContent = 'Uploading…';
  await upload({ force: true });
  show();
});

stopBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('phone');
  status.textContent = 'Stopped. The repo is still on GitHub; delete it there if you want it gone.';
  uploadBtn.hidden = stopBtn.hidden = true;
});

show();
