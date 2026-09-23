'use strict';

(function () {
  const state = {
    user: null,
    words: [],
    selectionButton: null,
    overlay: null,
    overlayWordId: null,
    hideTimer: null,
    toastTimer: null,
    selectionTimer: null,
    currentAudio: null,
  };

  const styles = `
    .study-auth {
      position: fixed;
      top: 12px;
      right: 14px;
      z-index: 1000;
      border: 1px solid #caa56b;
      border-radius: 999px;
      padding: .45rem .75rem;
      background: rgba(255,253,250,.96);
      color: #8c2430;
      box-shadow: 0 4px 18px rgba(0,0,0,.12);
      font: 600 .78rem system-ui, sans-serif;
      cursor: pointer;
    }
    .study-auth[data-logged-in="true"] {
      border-color: #8c2430;
    }
    .study-selection-button {
      position: fixed;
      z-index: 1001;
      border: 0;
      border-radius: 999px;
      padding: .55rem .8rem;
      background: #8c2430;
      color: white;
      box-shadow: 0 5px 18px rgba(0,0,0,.22);
      font: 600 .78rem system-ui, sans-serif;
      cursor: pointer;
    }
    .study-selection-button--touch {
      left: 50% !important;
      top: auto !important;
      bottom: calc(20px + env(safe-area-inset-bottom)) !important;
      transform: translateX(-50%);
      white-space: nowrap;
    }
    .study-word {
      background: rgba(202,165,107,.32);
      border-bottom: 2px solid #8c2430;
      border-radius: 3px;
      cursor: pointer;
    }
    .study-overlay {
      position: fixed;
      z-index: 1002;
      max-width: min(320px, calc(100vw - 20px));
      padding: .7rem .8rem;
      border: 1px solid #caa56b;
      border-radius: 10px;
      background: #fffdfa;
      color: #342722;
      box-shadow: 0 8px 26px rgba(45,32,24,.2);
      font: .88rem/1.35 system-ui, sans-serif;
    }
    .study-overlay-term {
      display: block;
      color: #8c2430;
      font-weight: 700;
      margin-bottom: .25rem;
    }
    .study-overlay-meaning {
      display: block;
      margin-bottom: .45rem;
    }
    .study-overlay-audio {
      border: 0;
      border-radius: 999px;
      padding: .25rem .55rem;
      background: #f5eee6;
      color: #8c2430;
      cursor: pointer;
      font: inherit;
    }
    .study-overlay-actions {
      display: flex;
      gap: .4rem;
      margin-top: .55rem;
    }
    .study-overlay-edit,
    .study-overlay-delete {
      border: 0;
      border-radius: 999px;
      padding: .25rem .55rem;
      cursor: pointer;
      font: inherit;
    }
    .study-overlay-edit {
      background: #f5eee6;
      color: #8c2430;
    }
    .study-overlay-delete {
      background: #f9e4e4;
      color: #a32929;
    }
    .study-toast {
      position: fixed;
      left: 50%;
      bottom: 24px;
      z-index: 1003;
      max-width: calc(100vw - 32px);
      padding: .7rem 1rem;
      border-radius: 999px;
      background: #342722;
      color: #fffdfa;
      box-shadow: 0 8px 24px rgba(45,32,24,.24);
      transform: translate(-50%, 12px);
      opacity: 0;
      transition: opacity .18s ease, transform .18s ease;
      font: 600 .85rem system-ui, sans-serif;
      pointer-events: none;
    }
    .study-toast.visible {
      transform: translate(-50%, 0);
      opacity: 1;
    }
  `;

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeText(value) {
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function showToast(message) {
    let toast = document.querySelector('.study-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'study-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove('visible');
    }, 2600);
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function createAuthButton() {
    const button = document.createElement('button');
    button.className = 'study-auth';
    button.type = 'button';
    button.addEventListener('click', async () => {
      try {
        if (state.user) await window.studyFirebase.signOut();
        else await window.studyFirebase.signIn();
      } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
          console.error('Study sign-in error:', error);
          alert('Não foi possível autenticar com o Google.');
        }
      }
    });
    document.body.appendChild(button);
    state.authButton = button;
  }

  function renderAuthButton() {
    if (!state.authButton) return;
    if (state.user) {
      const name = (state.user.displayName || state.user.email || 'Usuário').split(' ')[0];
      state.authButton.textContent = `${name} · Sair`;
      state.authButton.dataset.loggedIn = 'true';
      state.authButton.title = 'Sair';
    } else {
      state.authButton.textContent = 'Entrar para salvar';
      state.authButton.dataset.loggedIn = 'false';
      state.authButton.title = 'Entrar com Google';
    }
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return '';
    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (!text || text.length > 300) return '';
    const range = selection.getRangeAt(0);
    const main = document.querySelector('main');
    return main && main.contains(range.commonAncestorContainer) ? text : '';
  }

  function hideSelectionButton() {
    state.selectionButton?.remove();
    state.selectionButton = null;
  }

  function showSelectionButton() {
    const text = getSelectedText();
    if (!text) {
      hideSelectionButton();
      return;
    }
    hideSelectionButton();
    const selection = window.getSelection();
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const button = document.createElement('button');
    button.className = 'study-selection-button';
    button.type = 'button';
    button.textContent = state.user ? 'Salvar para estudar' : 'Entrar para salvar';
    const touchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (touchDevice) {
      button.classList.add('study-selection-button--touch');
    } else {
      button.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - 180))}px`;
      button.style.top = `${Math.max(10, rect.top - 46)}px`;
    }
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => saveSelection(text));
    document.body.appendChild(button);
    state.selectionButton = button;
  }

  async function saveSelection(term) {
    hideSelectionButton();
    if (!state.user) {
      try {
        await window.studyFirebase.signIn();
      } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
          console.error('Study sign-in error:', error);
          alert('Não foi possível autenticar com o Google.');
        }
      }
      return;
    }

    const savedTerm = normalizeText(term);
    const meaning = window.prompt(`Informe o significado de:\n\n${savedTerm}`);
    const savedMeaning = meaning ? normalizeText(meaning) : '';
    if (!savedTerm || !savedMeaning) return;

    try {
      const ref = window.studyFirebase.db
        .collection('users').doc(state.user.uid).collection('customWords').doc();
      await ref.set({
        term: savedTerm,
        meaning: savedMeaning,
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      state.words.push({ id: ref.id, term: savedTerm, meaning: savedMeaning });
      applyHighlights();
      showToast('Salvo para estudar no ov-dansk.');
    } catch (error) {
      console.error('Save custom word error:', error);
      alert('Não foi possível salvar esta palavra ou frase.');
    }
  }

  function unwrapHighlights() {
    document.querySelectorAll('.study-word').forEach(mark => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
  }

  function shouldSkip(node) {
    const parent = node.parentElement;
    return !parent || parent.closest(
      'script,style,button,input,textarea,select,.study-auth,.study-selection-button,.study-overlay,.study-word'
    );
  }

  function applyHighlights() {
    unwrapHighlights();
    const words = [...state.words]
      .filter(item => item.term && item.meaning)
      .sort((a, b) => b.term.length - a.term.length);
    if (!words.length) return;

    const pattern = words.map(item => escapeRegExp(item.term)).join('|');
    const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])`, 'giu');
    const main = document.querySelector('main');
    if (!main) return;

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (!shouldSkip(walker.currentNode)) nodes.push(walker.currentNode);
    }
    nodes.forEach(node => {
      const text = node.nodeValue;
      regex.lastIndex = 0;
      if (!regex.test(text)) return;
      regex.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let last = 0;
      text.replace(regex, (match, _group, offset) => {
        fragment.appendChild(document.createTextNode(text.slice(last, offset)));
        const item = words.find(word => word.term.toLocaleLowerCase() === match.toLocaleLowerCase());
        if (!item) {
          fragment.appendChild(document.createTextNode(match));
        } else {
          const mark = document.createElement('mark');
          mark.className = 'study-word';
          mark.dataset.wordId = item.id;
          mark.textContent = match;
          fragment.appendChild(mark);
        }
        last = offset + match.length;
        return match;
      });
      fragment.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(fragment);
    });
  }

  function showOverlay(mark) {
    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
    hideOverlay();
    const item = state.words.find(word => word.id === mark.dataset.wordId);
    if (!item) return;
    const overlay = document.createElement('div');
    overlay.className = 'study-overlay';
    const term = document.createElement('span');
    term.className = 'study-overlay-term';
    term.textContent = item.term;
    const meaning = document.createElement('span');
    meaning.className = 'study-overlay-meaning';
    meaning.textContent = item.meaning;
    const audio = document.createElement('button');
    audio.className = 'study-overlay-audio';
    audio.type = 'button';
    audio.textContent = '🔊 Ouvir';
    audio.addEventListener('click', event => {
      event.stopPropagation();
      playTts(item.term);
    });
    const actions = document.createElement('div');
    actions.className = 'study-overlay-actions';
    const edit = document.createElement('button');
    edit.className = 'study-overlay-edit';
    edit.type = 'button';
    edit.textContent = 'Editar definição';
    edit.addEventListener('click', event => {
      event.stopPropagation();
      editMeaning(item, meaning);
    });
    const remove = document.createElement('button');
    remove.className = 'study-overlay-delete';
    remove.type = 'button';
    remove.textContent = 'Excluir';
    remove.addEventListener('click', event => {
      event.stopPropagation();
      deleteWord(item);
    });
    overlay.addEventListener('mouseenter', () => {
      if (state.hideTimer) {
        window.clearTimeout(state.hideTimer);
        state.hideTimer = null;
      }
    });
    overlay.addEventListener('mouseleave', scheduleHideOverlay);
    actions.append(edit, remove);
    overlay.append(term, meaning, audio, actions);
    document.body.appendChild(overlay);
    state.overlay = overlay;
    state.overlayWordId = item.id;
    const rect = mark.getBoundingClientRect();
    overlay.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - overlay.offsetWidth - 10))}px`;
    overlay.style.top = `${Math.min(window.innerHeight - overlay.offsetHeight - 10, rect.bottom + 8)}px`;
  }

  function hideOverlay() {
    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
    state.overlay?.remove();
    state.overlay = null;
    state.overlayWordId = null;
  }

  function scheduleHideOverlay() {
    if (state.hideTimer) window.clearTimeout(state.hideTimer);
    state.hideTimer = window.setTimeout(hideOverlay, 180);
  }

  async function editMeaning(item, meaningElement) {
    const value = window.prompt(`Edite o significado de:\n\n${item.term}`, item.meaning);
    const meaning = value ? normalizeText(value) : '';
    if (!meaning || meaning === item.meaning) return;
    try {
      await window.studyFirebase.db.collection('users').doc(state.user.uid)
        .collection('customWords').doc(item.id)
        .update({
          meaning,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      item.meaning = meaning;
      meaningElement.textContent = meaning;
      applyHighlights();
    } catch (error) {
      console.error('Update custom word error:', error);
      alert('Não foi possível atualizar a definição.');
    }
  }

  async function deleteWord(item) {
    if (!window.confirm(`Excluir "${item.term}" das palavras salvas?`)) return;
    try {
      const userRef = window.studyFirebase.db.collection('users').doc(state.user.uid);
      await Promise.all([
        userRef.collection('customWords').doc(item.id).delete(),
        userRef.collection('progress').doc(`custom_${item.id}`).delete(),
      ]);
      state.words = state.words.filter(word => word.id !== item.id);
      hideOverlay();
      applyHighlights();
    } catch (error) {
      console.error('Delete custom word error:', error);
      alert('Não foi possível excluir esta palavra ou frase.');
    }
  }

  function playTts(text) {
    state.currentAudio?.pause();
    window.speechSynthesis?.cancel();
    const audio = new Audio();
    audio.referrerPolicy = 'no-referrer';
    audio.src = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=da&q=${encodeURIComponent(text)}`;
    state.currentAudio = audio;
    audio.onerror = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'da-DK';
      window.speechSynthesis?.speak(utterance);
    };
    audio.play().catch(() => audio.onerror());
  }

  async function loadWords(user) {
    state.words = [];
    if (user) {
      const snapshot = await window.studyFirebase.db
        .collection('users').doc(user.uid).collection('customWords').get();
      state.words = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    applyHighlights();
  }

  function bindInteractions() {
    const scheduleSelectionButton = () => {
      if (state.selectionTimer) window.clearTimeout(state.selectionTimer);
      state.selectionTimer = window.setTimeout(showSelectionButton, 80);
    };
    document.addEventListener('selectionchange', scheduleSelectionButton);
    document.addEventListener('mouseup', scheduleSelectionButton);
    document.addEventListener('touchend', scheduleSelectionButton);
    document.addEventListener('mouseover', event => {
      const mark = event.target.closest('.study-word');
      if (mark && !mark.contains(event.relatedTarget)) showOverlay(mark);
    });
    document.addEventListener('mouseout', event => {
      const mark = event.target.closest('.study-word');
      if (mark && !mark.contains(event.relatedTarget)) scheduleHideOverlay();
    });
    document.addEventListener('click', event => {
      const mark = event.target.closest('.study-word');
      if (mark) {
        event.stopPropagation();
        showOverlay(mark);
      } else if (!event.target.closest('.study-overlay')) {
        hideOverlay();
      }
    });
    window.addEventListener('scroll', hideOverlay, { passive: true });
  }

  function init() {
    if (!window.studyFirebase) return;
    injectStyles();
    createAuthButton();
    bindInteractions();
    window.studyFirebase.auth.onAuthStateChanged(async user => {
      state.user = user;
      window.studyFirebase.user = user;
      renderAuthButton();
      try {
        await loadWords(user);
      } catch (error) {
        console.error('Load custom words error:', error);
        alert('Não foi possível carregar suas palavras salvas.');
      }
    });
  }

  window.addEventListener('load', init);
})();
