# Integração de palavras salvas entre aplicações estáticas

Este documento descreve como integrar uma aplicação HTML estática, como
`indfodsretsproven`, ao fluxo de aprendizado de palavras do `ov-dansk`.

O fluxo permite que o usuário:

1. faça login com a mesma conta Google usada no `ov-dansk`;
2. selecione uma palavra ou frase em uma página de estudo;
3. informe manualmente o significado;
4. salve o termo no Firebase;
5. veja o termo destacado novamente nas páginas de estudo;
6. revise o termo no exercício **Saved Words** do `ov-dansk`.

## Arquitetura

As duas aplicações usam o mesmo projeto Firebase:

```text
Firebase project: ov-dansk
Authentication: Google Sign-In
Database: Cloud Firestore
```

Os dados são separados por usuário:

```text
users/{uid}/customWords/{wordId}
users/{uid}/progress/custom_{wordId}
```

`customWords` contém o termo salvo e seu significado. A coleção `progress`
contém o estado de revisão SM-2 usado pelo `ov-dansk`.

## Pré-requisitos do Firebase

### 1. Ativar Google Authentication

No Firebase Console:

1. Abra **Authentication**.
2. Abra **Sign-in method**.
3. Ative o provedor **Google**.
4. Configure o e-mail de suporte, se solicitado.

### 2. Autorizar os domínios

Todos os domínios usados para abrir as aplicações devem estar em
**Authentication → Settings → Authorized domains**.

Exemplos:

```text
rbasniak.github.io
localhost
127.0.0.1
```

O login pode funcionar em uma aplicação e falhar em outra se o domínio da
segunda aplicação não estiver autorizado.

### 3. Configurar as regras do Firestore

As regras devem permitir que cada usuário leia e escreva somente dentro do
próprio documento:

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

Não use regras públicas como `allow read, write: if true`.

## Inicialização Firebase na aplicação estática

Carregue os SDKs compatíveis do Firebase antes do código da aplicação:

```html
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-firestore.js"></script>
<script src="assets/firebase-client.js"></script>
<script src="assets/custom-words.js"></script>
```

O arquivo `firebase-client.js` inicializa o mesmo projeto e expõe:

```javascript
window.studyFirebase = {
  app,
  auth,
  db,
  provider,
  user: null,
  signIn(),
  signOut(),
};
```

Em um novo projeto, copie a estrutura do arquivo e substitua apenas os
caminhos. A configuração do Firebase Web pode ficar no cliente; a proteção
real dos dados é feita pelas regras do Firestore.

## Login compartilhado

O Firebase mantém a sessão por origem. Portanto, duas páginas sob o mesmo
domínio GitHub Pages conseguem reutilizar a sessão:

```text
https://usuario.github.io/app-a/
https://usuario.github.io/app-b/
```

Aplicações em domínios diferentes continuam usando o mesmo usuário Firebase,
mas podem exigir novo fluxo de login dependendo do navegador e das políticas
de armazenamento.

O código deve observar `onAuthStateChanged`:

```javascript
window.studyFirebase.auth.onAuthStateChanged(async user => {
  if (!user) {
    renderLoggedOutState();
    return;
  }

  renderLoggedInState(user);
  await loadSavedWords(user);
});
```

Não carregue palavras antes de conhecer o `uid`.

## Modelo de uma palavra salva

Cada documento em `users/{uid}/customWords` possui este formato:

```javascript
{
  term: "befolkningsgrupper",
  meaning: "grupos populacionais",
  sourceUrl: "https://usuario.github.io/app/kapitel-1.html",
  sourceTitle: "Kapitel 1 – Danmarks historie",
  createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
}
```

O `term` e o `meaning` devem ser normalizados:

```javascript
function normalizeText(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
```

Isso evita documentos com espaços acidentais e melhora a comparação com o
texto da página.

## Salvando uma seleção

O fluxo recomendado é:

```javascript
async function saveSelection(selectedText) {
  if (!currentUser) {
    await studyFirebase.signIn();
    return;
  }

  const term = normalizeText(selectedText);
  const input = window.prompt(`Informe o significado de:\n\n${term}`);
  const meaning = input ? normalizeText(input) : "";

  if (!term || !meaning) {
    return;
  }

  const ref = studyFirebase.db
    .collection("users")
    .doc(currentUser.uid)
    .collection("customWords")
    .doc();

  await ref.set({
    term,
    meaning,
    sourceUrl: window.location.href,
    sourceTitle: document.title,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}
```

Depois do salvamento, recarregue ou atualize o array local para que o termo
seja destacado imediatamente.

## Carregando as palavras do usuário

```javascript
async function loadSavedWords(user) {
  const snapshot = await studyFirebase.db
    .collection("users")
    .doc(user.uid)
    .collection("customWords")
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}
```

Não carregue a coleção inteira sem autenticação e nunca use um `uid` recebido
da URL ou de um campo editável pelo usuário.

## Destacando termos no HTML

A implementação atual percorre apenas o conteúdo de `main` e ignora elementos
interativos:

```javascript
const regex = new RegExp(
  `(?<![\\p{L}\\p{N}_])(${terms})(?![\\p{L}\\p{N}_])`,
  "giu"
);
```

As flags importantes são:

- `g`: encontra todas as ocorrências;
- `i`: ignora maiúsculas e minúsculas;
- `u`: habilita Unicode, importante para dinamarquês.

Ordene os termos do maior para o menor antes de criar a expressão regular.
Assim, uma frase salva tem prioridade sobre uma palavra contida nela.

```javascript
const words = savedWords
  .filter(item => item.term && item.meaning)
  .sort((a, b) => b.term.length - a.term.length);
```

Ao criar o destaque, use `textContent`, não `innerHTML`, para evitar injeção de
HTML:

```javascript
const mark = document.createElement("mark");
mark.className = "study-word";
mark.dataset.wordId = item.id;
mark.textContent = matchedText;
```

## Overlay de significado

Ao passar o mouse ou tocar no termo destacado, mostre:

- o termo em dinamarquês;
- o significado informado pelo usuário;
- botão de TTS;
- botão para editar;
- botão para excluir.

O overlay deve usar `textContent` para todos os valores vindos do Firestore.
Nunca concatene significado do usuário diretamente em HTML sem escapar.

Para desktop:

```javascript
mark.addEventListener("mouseenter", () => showOverlay(mark));
```

Para touch:

```javascript
mark.addEventListener("click", event => {
  event.stopPropagation();
  showOverlay(mark);
});
```

Em dispositivos Samsung, o menu nativo de seleção pode cobrir o botão
posicionado próximo ao texto. Para touch, posicione a ação de salvar fixa na
parte inferior da viewport:

```css
.study-selection-button--touch {
  position: fixed;
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
}
```

Use também `selectionchange`, além de `mouseup` e `touchend`, porque alguns
navegadores Android atualizam a seleção depois do evento de toque:

```javascript
document.addEventListener("selectionchange", scheduleSelectionButton);
```

## Editar e excluir

### Editar significado

```javascript
async function updateMeaning(itemId, meaning) {
  const normalized = normalizeText(meaning);
  if (!normalized) return;

  await studyFirebase.db
    .collection("users").doc(currentUser.uid)
    .collection("customWords").doc(itemId)
    .update({
      meaning: normalized,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
}
```

Atualize o array local e reaplique os destaques depois do `update`.

### Excluir

Ao excluir uma palavra, remova também seu progresso de revisão:

```javascript
const userRef = studyFirebase.db.collection("users").doc(currentUser.uid);

await Promise.all([
  userRef.collection("customWords").doc(itemId).delete(),
  userRef.collection("progress").doc(`custom_${itemId}`).delete(),
]);
```

## Integração com o `ov-dansk`

O `ov-dansk` deve carregar as palavras no mesmo usuário:

```javascript
async function loadCustomWords() {
  if (!_currentUser) return [];

  const snapshot = await _db
    .collection("users").doc(_currentUser.uid)
    .collection("customWords").get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}
```

No exercício:

```javascript
const data = await loadCustomWords();
const progressMap = await loadProgress("custom");
const exercises = selectAdaptiveItems(
  data,
  progressMap,
  config.practiceMode || "mixed",
  count
);
```

Cada item deve ter pelo menos:

```javascript
{
  id,
  term,
  meaning
}
```

O exercício mostra `term`, o usuário tenta lembrar `meaning`, e então escolhe:

```text
Don't know
Hard
Good
Easy
```

Não há correção automática. A resposta é uma autoavaliação.

## Progresso e SM-2

O progresso deve ser salvo usando:

```javascript
recordAnswer("custom", String(item.id), resultType);
```

Isso cria o documento:

```text
users/{uid}/progress/custom_{itemId}
```

Os valores aceitos pelo fluxo atual são:

```text
dont_know
hard
good
easy
```

Use `loadProgress("custom")` para alimentar os modos:

- `mixed`: revisões vencidas misturadas com itens novos;
- `learn`: somente itens novos;
- `review`: somente itens vencidos.

Os rótulos de intervalo devem usar a mesma função de previsão do algoritmo
SM-2 que grava a resposta. Não duplique o cálculo em cada exercício.

## TTS do termo salvo

O Google Translate TTS é um endpoint interno e exige ausência de `Referer`:

```javascript
function playGoogleTts(text) {
  const audio = new Audio();
  audio.referrerPolicy = "no-referrer";
  audio.src =
    "https://translate.google.com/translate_tts" +
    "?ie=UTF-8&client=tw-ob&tl=da&q=" +
    encodeURIComponent(text);
  audio.play().catch(() => {
    // fallback para speechSynthesis
  });
}
```

No HTML da página, inclua:

```html
<meta name="referrer" content="no-referrer">
```

O fallback deve ser protegido contra cancelamentos de áudio:

```javascript
let generation = 0;

function stopTts() {
  generation++;
  currentAudio?.pause();
  currentAudio = null;
  speechSynthesis?.cancel();
}

function playTts(text) {
  stopTts();
  const requestGeneration = generation;
  const audio = new Audio();
  audio.referrerPolicy = "no-referrer";
  audio.src = googleTtsUrl(text);
  currentAudio = audio;

  audio.onerror = () => {
    if (requestGeneration !== generation) return;
    speakWithBrowser(text);
  };

  audio.play().catch(error => {
    if (requestGeneration !== generation) return;
    if (error?.name === "AbortError") return;
    audio.onerror();
  });
}
```

Sem essa proteção, pausar um áudio antigo ao avançar para a próxima pergunta
pode ser interpretado como falha do Google e iniciar inesperadamente o TTS do
navegador.

## Checklist de integração

- [ ] Firebase App, Auth e Firestore carregados antes dos scripts da aplicação.
- [ ] Mesmo `projectId`, `authDomain`, `appId` e credenciais Web do `ov-dansk`.
- [ ] Google Authentication ativado.
- [ ] Domínios publicados autorizados no Firebase.
- [ ] Regras do Firestore limitando acesso ao `request.auth.uid`.
- [ ] Palavras salvas em `users/{uid}/customWords`.
- [ ] Campos `term` e `meaning` normalizados com `trim`.
- [ ] Termos comparados sem diferenciar maiúsculas/minúsculas.
- [ ] Frases maiores processadas antes de palavras menores.
- [ ] Conteúdo do Firestore inserido com `textContent`.
- [ ] Edição atualiza `updatedAt`.
- [ ] Exclusão remove também `progress/custom_{id}`.
- [ ] Exercício usa `subject: "custom"`.
- [ ] TTS usa `no-referrer`.
- [ ] Fallback do TTS ignora `AbortError` e requests obsoletas.
- [ ] Teste realizado no domínio publicado, não apenas com arquivo local.
- [ ] Cache busting aplicado quando scripts estáticos forem alterados.

## Arquivos usados nesta implementação

### `indfodsretsproven`

```text
assets/firebase-client.js
assets/custom-words.js
```

Esses scripts são carregados pelas páginas HTML estáticas e implementam
autenticação, seleção, gravação, destaque, overlay, edição, exclusão e TTS.

### `ov-dansk`

```text
js/firebase.js
js/custom-exercise.js
custom-config.html
custom-exercise.html
progress.html
```

`js/firebase.js` fornece autenticação, Firestore, progresso e seleção adaptativa.
Os demais arquivos implementam configuração, exercício e apresentação do
progresso das palavras salvas.

## Limitações e evolução futura

- `translate_tts` não é uma API oficial documentada e pode sofrer limitações.
- O significado é informado manualmente; não há tradução automática.
- A busca atual destaca ocorrências literais, ignorando maiúsculas e minúsculas,
  mas não faz lematização ou análise morfológica.
- Para grande volume de palavras, considere indexação ou processamento no
  servidor em vez de criar uma expressão regular com todos os termos.
- Para aplicações com requisitos de produção, considere Google Cloud
  Text-to-Speech, Azure Speech ou outro serviço oficial.
