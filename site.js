const descriptions = {
  'clock-match': 'Dynamic time warping matches hand motion in the video to the sketch. Across 60 sampled trajectories, the aligned object masks reach 0.766 mean IoU, and their centers differ by 1.74% of the image diagonal on average.',
  build: 'RGB and depth establish the tabletop scale. The agent places the objects, chooses a contact surface and hand approach, then sets waypoints for grasp, motion and release.',
  generate: 'The rendered palm sphere and moving object specify the approach and tilt. The video model adds articulated fingers and scene appearance.',
  fit: 'After temporal alignment, the sketch fixes the bottle geometry and poses. The fit adjusts hand scale and wrist pose first, then wrist and finger angles to preserve image alignment and maintain contact.',
  joints: 'At acquisition, the robot solves for arm and finger joints together. Its pads approach the assigned surface targets with opposing normals, subject to joint limits and finger coupling.'
};
const bodyNotes = {
  franka: 'Franka + Robotiq places a toy into the bowl. Across tasks: 38 of 72 successful replays (52.8%).',
  ur7: 'UR7e + Inspire grasps the pan by its handle. Across tasks: 30 of 72 successful replays (41.7%).',
  ur3: 'UR3e + Sharpa pushes the laptop lid closed. Across tasks: 18 of 72 successful replays (25.0%).'
};

// Stream the main film when the host supports ranges. Local preview also supports seeking via a blob.
const sources = new Map();
function seekableSource(path) {
  if (location.protocol === 'file:') return Promise.resolve(path);
  if (!sources.has(path)) {
    const probe = path.split('?')[0] === 'media/film.mp4';
    const source = fetch(path, probe ? {headers: {Range: 'bytes=0-1'}} : {}).then(async response => {
      if (probe && response.status === 206) {
        await response.body?.cancel();
        return path;
      }
      if (!response.ok) throw Error(response.status);
      const bytes = await response.blob();
      return URL.createObjectURL(new Blob([bytes], {type: 'video/mp4'}));
    }).catch(() => {
      sources.delete(path);
      return path;
    });
    sources.set(path, source);
  }
  return sources.get(path);
}
async function prepare(video) {
  const path = video.dataset.src;
  const url = await seekableSource(path);
  if (video.dataset.src !== path) return false;
  if (video.getAttribute('src') !== url) {
    video.preload = 'metadata';
    video.src = url;
  }
  return true;
}
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      observer.unobserve(entry.target);
      prepare(entry.target);
    }
  }
}, {rootMargin: '280px'});
document.querySelectorAll('video').forEach(video => observer.observe(video));

async function showClip(video, key, label) {
  video.pause();
  video.poster = 'media/' + key + '.jpg';
  video.dataset.src = 'media/' + key + '.mp4';
  video.setAttribute('aria-label', label);
  if (await prepare(video)) video.play().catch(() => {});
}
function switcher(group, target, update) {
  const buttons = document.querySelectorAll(group + ' button');
  const video = document.querySelector(target);
  for (const button of buttons) {
    button.addEventListener('click', () => {
      for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
      update(button.dataset.id, button);
      showClip(video, button.dataset.clip || button.dataset.id, button.textContent.trim());
    });
  }
}
switcher('#steps', '#methodvideo', key => document.querySelector('#explain').textContent = descriptions[key]);
switcher('#replay-choices', '#replay', (key, button) => document.querySelector('#replay-note').textContent = button.dataset.note);
switcher('#bodies', '#bodyvideo', key => document.querySelector('#bodynote').textContent = bodyNotes[key]);
const gallery = document.querySelector('#gallery');
const taskButtons = [...document.querySelectorAll('#tasks button')];
const familyButtons = [...document.querySelectorAll('#gallery-families button')];
const viewButtons = [...document.querySelectorAll('.gallery-views button')];
const galleryLabels = document.querySelector('#gallery-stage .viewnames');
const galleryStage = document.querySelector('#gallery-stage');
let task = taskButtons[0];
let galleryView = matchMedia('(max-width: 700px)').matches ? '-r' : '';
let galleryTicket = 0;
function mark(buttons, selected) {
  for (const button of buttons) button.setAttribute('aria-pressed', String(button === selected));
}
function displayGallery(play, time = 0) {
  const ticket = ++galleryTicket;
  const key = task.dataset.id + galleryView;
  gallery.pause();
  gallery.poster = 'media/' + key + '.jpg';
  gallery.dataset.src = 'media/' + key + '.mp4';
  gallery.setAttribute('aria-label', task.textContent.trim() + ', ' + (viewButtons.find(b => b.dataset.view === galleryView).textContent));
  galleryLabels.hidden = Boolean(galleryView);
  galleryStage.classList.toggle('single-stage', Boolean(galleryView));
  mark(viewButtons, viewButtons.find(b => b.dataset.view === galleryView));
  if (!play && !time && !gallery.hasAttribute('src')) return;
  prepare(gallery).then(ready => {
    if (!ready || ticket !== galleryTicket) return;
    const start = () => {
      if (ticket !== galleryTicket) return;
      gallery.currentTime = Math.min(time, gallery.duration || time);
      if (play) gallery.play().catch(() => {});
    };
    if (gallery.readyState >= 1) start();
    else gallery.addEventListener('loadedmetadata', start, {once:true});
  });
}
function selectTask(button) {
  task = button;
  mark(taskButtons, task);
  document.querySelector('#gallery-title').textContent = task.textContent.trim();
  document.querySelector('#tasknote').textContent = task.dataset.note;
  displayGallery(true);
}
for (const button of taskButtons) button.addEventListener('click', () => selectTask(button));
for (const family of familyButtons) family.addEventListener('click', () => {
  if (family.getAttribute('aria-pressed') === 'true') return;
  mark(familyButtons, family);
  for (const button of taskButtons) button.hidden = button.dataset.family !== family.dataset.family;
  selectTask(taskButtons.find(button => !button.hidden));
});
for (const button of viewButtons) button.addEventListener('click', () => {
  if (galleryView === button.dataset.view) return;
  galleryView = button.dataset.view;
  displayGallery(!gallery.paused, gallery.currentTime);
});
displayGallery(false);
const movie = document.querySelector('#movie');
const seek = document.querySelector('#filmseek');
const clock = document.querySelector('#filmclock');
const play = document.querySelector('#playfilm');
const formatTime = sec => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
function updateClock() {
  if (!Number.isFinite(movie.duration)) return;
  seek.disabled = false;
  seek.max = movie.duration;
  if (!dragging) seek.value = movie.currentTime;
  clock.textContent = formatTime(Number(seek.value)) + ' / ' + formatTime(movie.duration);
}
let dragging = false;
seek.addEventListener('pointerdown', () => { dragging = true; });
for (const event of ['pointerup', 'pointercancel', 'blur']) {
  seek.addEventListener(event, () => { dragging = false; });
}
seek.addEventListener('input', () => {
  movie.currentTime = Number(seek.value);
  updateClock();
});
movie.addEventListener('loadedmetadata', updateClock);
movie.addEventListener('timeupdate', updateClock);
movie.addEventListener('play', () => { play.hidden = true; });
let filmRequest = 0;
async function playFilm(start) {
  const ticket = ++filmRequest;
  if (!(await prepare(movie)) || ticket !== filmRequest) return;
  function begin() {
    if (ticket !== filmRequest) return;
    if (start !== undefined) movie.currentTime = start;
    movie.play().catch(() => {});
  }
  if (movie.readyState >= 1) begin();
  else movie.addEventListener('loadedmetadata', begin, {once: true});
}
play.addEventListener('click', () => playFilm());
const chapterButtons = [...document.querySelectorAll('.film-jumps button')];
for (const button of chapterButtons) {
  button.addEventListener('click', () => {
    playFilm(Number(button.dataset.time));
    if (movie.getBoundingClientRect().top < 0) movie.scrollIntoView({block:'center'});
  });
}

async function playComparison(section) {
  const clips = [...section.querySelectorAll('.cue-strip video')];
  await Promise.all(clips.map(prepare));
  for (const clip of clips) {
    clip.currentTime = 0;
    clip.play().catch(() => {});
  }
}
document.querySelector('#keyplay').addEventListener('click', () => playComparison(document.querySelector('#key-control')));
const longTasks = document.querySelector('#long-tasks');
longTasks.addEventListener('toggle', () => {
  if (!longTasks.open) longTasks.querySelectorAll('video').forEach(video => video.pause());
});

// Trial counts in paper Table 5, ordered by the task labels below.
const taskLabels = ['All five tasks', 'Brush pickup', 'Measuring cup', 'Cup stacking', 'Water pouring', 'Trash disposal'];
const conditions = [
  {label: 'Teleop · 216', counts: [9, 10, 5, 7, 6]},
  {label: 'Sketch · 216', counts: [7, 5, 1, 4, 6]},
  {label: 'Sketch · 648', counts: [13, 7, 3, 9, 9]}
];
const taskSelect = document.querySelector('#physical-task');
for (const task of taskLabels) taskSelect.add(new Option(task));
function renderPhysicalResults() {
  const task = taskSelect.selectedIndex;
  const bars = document.querySelector('#physical-bars');
  bars.replaceChildren();
  for (const condition of conditions) {
    const wins = task ? condition.counts[task - 1] : condition.counts.reduce((sum, n) => sum + n, 0);
    const rate = task ? wins * 5 : wins;
    const row = document.createElement('div');
    row.className = 'barrow';
    const label = document.createElement('b');
    label.textContent = condition.label;
    const track = document.createElement('i');
    const bar = document.createElement('u');
    bar.style.width = rate + '%';
    track.append(bar);
    const score = document.createElement('strong');
    score.textContent = task ? wins + '/20' : rate + '%';
    row.append(label, track, score);
    bars.append(row);
  }
}
taskSelect.addEventListener('change', renderPhysicalResults);
renderPhysicalResults();

const dimensions = {
  layout: ['11.46%', '73.18%', 'Four starting layouts for the same task: put the can in the bowl.', 'Videos matching the requested initial position and orientation across 384 paired requests.'],
  interaction: ['76.30%', '80.47%', 'Four planned bottle retries. Each pair shows the sketch on the left and the generated video on the right.', 'Videos matching the requested hand, contact region and interaction mode across 384 paired requests.'],
  motion: ['9.11%', '70.31%', 'Follow the key tip as it slides along the lock face and enters the slot.', 'Videos matching the requested object path across 384 paired requests.']
};
const conditionFilm = document.querySelector('#condition-film');
const conditionButtons = [...document.querySelectorAll('#condition-tabs button')];
let conditionKind = 'layout';
for (const button of conditionButtons) button.addEventListener('click', () => {
  if (conditionKind === button.dataset.id) return;
  conditionKind = button.dataset.id;
  mark(conditionButtons, button);
  const [baseline, sketch, description, definition] = dimensions[conditionKind];
  const values = document.querySelectorAll('.controlstat strong');
  values[0].textContent = baseline;
  values[1].textContent = sketch;
  document.querySelector('#condition-note').textContent = description;
  document.querySelector('.controlstat p').textContent = definition;
  showClip(conditionFilm, button.dataset.clip, description);
});
function markChapter() {
  const active = chapterButtons.filter(button => Number(button.dataset.time) <= movie.currentTime).pop();
  for (const button of chapterButtons) {
    if (button === active) button.setAttribute('aria-current','time');
    else button.removeAttribute('aria-current');
  }
}
movie.addEventListener('timeupdate', markChapter);
markChapter();
const pageHeader = document.querySelector('.page-top');
const linkStrip = pageHeader.querySelector('.top-links');
const chapterLinks = [...linkStrip.querySelectorAll('a')];
const chapterTargets = chapterLinks.map(link => document.querySelector(link.hash));
const homeLink = pageHeader.querySelector('.brand');
let currentLink = homeLink;
let pendingNavFrame = false;

function updateChapterLink() {
  pendingNavFrame = false;
  const readingLine = pageHeader.offsetHeight + Math.min(140, innerHeight * 0.18);
  let next = homeLink;
  for (const [i, chapter] of chapterTargets.entries()) {
    if (chapter.offsetTop > scrollY + readingLine) break;
    next = chapterLinks[i];
  }
  if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) {
    next = chapterLinks[chapterLinks.length - 1];
  }
  if (next === currentLink) return;
  currentLink.removeAttribute('aria-current');
  next.setAttribute('aria-current', 'location');
  currentLink = next;
  if (linkStrip.scrollWidth > linkStrip.clientWidth) {
    const strip = linkStrip.getBoundingClientRect();
    const link = next.getBoundingClientRect();
    if (next === homeLink) linkStrip.scrollLeft = 0;
    else if (link.left < strip.left || link.right > strip.right) {
      linkStrip.scrollLeft += link.left - strip.left - (strip.width - link.width) / 2;
    }
  }
}
function scheduleChapterLink() {
  if (pendingNavFrame) return;
  pendingNavFrame = true;
  requestAnimationFrame(updateChapterLink);
}
addEventListener('scroll', scheduleChapterLink, {passive: true});
addEventListener('resize', scheduleChapterLink);
new ResizeObserver(scheduleChapterLink).observe(document.querySelector('main'));
updateChapterLink();

const chapterObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.replace('awaiting-entry', 'entering-chapter');
    chapterObserver.unobserve(entry.target);
  }
}, {rootMargin: '0px 0px -12% 0px'});
for (const chapter of document.querySelectorAll('main > section:not(#film)')) {
  if (chapter.getBoundingClientRect().top < innerHeight * 0.88) continue;
  chapter.classList.add('awaiting-entry');
  chapterObserver.observe(chapter);
}

const replay = document.querySelector('#replay');
const replayControls = document.querySelector('.replay-controls');
const replayPlay = document.querySelector('#replay-play');
const replaySeek = document.querySelector('#replay-seek');
const replayFull = document.querySelector('#replay-full');
const replayView = document.querySelector('.replay-view');
replay.controls = false;
replayControls.hidden = false;
async function toggleReplay() {
  if (!replay.paused) { replay.pause(); return; }
  if (await prepare(replay)) replay.play().catch(() => {});
}
function updateReplay() {
  replayPlay.textContent = replay.paused ? 'Play' : 'Pause';
  replayPlay.setAttribute('aria-label', replayPlay.textContent + ' replay');
  replaySeek.disabled = !Number.isFinite(replay.duration);
  if (!replaySeek.disabled) {
    replaySeek.max = replay.duration;
    replaySeek.value = replay.currentTime;
  }
  document.querySelector('#replay-clock').textContent = formatTime(replay.currentTime);
}
for (const event of ['timeupdate','loadedmetadata','emptied','play','pause']) replay.addEventListener(event, updateReplay);
replayPlay.addEventListener('click', toggleReplay);
replay.addEventListener('click', toggleReplay);
replaySeek.addEventListener('input', () => { if (Number.isFinite(replay.duration)) replay.currentTime = Number(replaySeek.value); });
replayFull.hidden = !document.fullscreenEnabled;
replayFull.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else replayView.requestFullscreen();
});
document.addEventListener('fullscreenchange', () => { replayFull.textContent = document.fullscreenElement === replayView ? 'Exit fullscreen' : 'Fullscreen'; });
updateReplay();

for (const ring of document.querySelectorAll('.roll-carousel')) {
  const slides = [...ring.querySelectorAll('figure')];
  const stage = ring.querySelector('.roll-stage');
  let index = 0;
  function shift(step) {
    index = (index + step + slides.length) % slides.length;
    for (const [i,slide] of slides.entries()) {
      const position = (i - index + slides.length) % slides.length;
      slide.style.order = position;
      slide.hidden = position >= 3;
      const video = slide.querySelector('video');
      if (slide.hidden) {
        video.pause();
        continue;
      }
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const distance = slide.offsetWidth + parseFloat(getComputedStyle(stage).columnGap);
        slide.getAnimations().forEach(animation => animation.cancel());
        slide.animate([{transform:'translateX('+step*distance+'px)'},{transform:'none'}],
                      {duration:240,easing:'ease-out'});
      }
    }
  }
  let lastWheel = -Infinity;
  stage.addEventListener('wheel',event=>{
    if(Math.abs(event.deltaX)<=Math.abs(event.deltaY)||Math.abs(event.deltaX)<4)return;
    event.preventDefault();
    if(event.timeStamp-lastWheel>220)shift(Math.sign(event.deltaX));
    lastWheel=event.timeStamp;
  },{passive:false});
  for (const button of ring.querySelectorAll('[data-step]'))
    button.addEventListener('click',()=>shift(Number(button.dataset.step)));
  ring.addEventListener('keydown',e=>{
    if(e.target.tagName==='VIDEO') return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();shift(e.key==='ArrowLeft'?-1:1);}
  });
  let start;
  stage.addEventListener('touchstart',e=>{
    const touch=e.touches[0],video=slides[index].querySelector('video');
    const rect=video.getBoundingClientRect();
    start=(touch.clientY<rect.bottom-42||touch.clientY>rect.bottom)?[touch.clientX,touch.clientY]:null;
  },{passive:true});
  stage.addEventListener('touchend',e=>{
    if(!start)return;
    const dx=e.changedTouches[0].clientX-start[0],dy=e.changedTouches[0].clientY-start[1];
    if(Math.abs(dx)>38&&Math.abs(dx)>Math.abs(dy)*1.4)shift(dx<0?1:-1);
    start=null;
  },{passive:true});
}
