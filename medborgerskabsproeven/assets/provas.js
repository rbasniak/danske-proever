(function () {
  'use strict';

  const app = document.querySelector('#quiz-app');
  const exams = window.examData || [];
  const passingScore = 20;
  let currentQuiz = null;

  function shuffle(items) {
    return [...items].sort(() => Math.random() - 0.5);
  }

  function allQuestions() {
    return exams.flatMap(exam => exam.questions.map(question => ({
      ...question,
      examTitle: exam.title,
    })));
  }

  function renderHome() {
    app.innerHTML = `
      <div class="eyebrow">Exercícios interativos</div>
      <h1>Provas e simulados</h1>
      <div class="quiz-intro">
        <p>Escolha uma prova anterior ou faça um simulado com 25 questões aleatórias de todas as provas.</p>
        <div class="quiz-actions">
          <button class="quiz-button" type="button" data-action="simulator">Começar simulado</button>
          <a class="quiz-button secondary" href="indice.html">Voltar ao índice</a>
        </div>
      </div>
      <h2>Provas anteriores</h2>
      <div class="exam-cards">
        ${exams.map(exam => `
          <button class="exam-card" type="button" data-exam="${exam.id}">
            <strong>${exam.title.replace(/^Medborgerskabsprøven\s+—\s+/, '')}</strong>
          </button>
        `).join('')}
      </div>
    `;
    app.querySelector('[data-action="simulator"]').addEventListener('click', startSimulator);
    app.querySelectorAll('[data-exam]').forEach(button => {
      button.addEventListener('click', () => {
        const exam = exams.find(item => item.id === button.dataset.exam);
        startQuiz(exam.title, exam.questions);
      });
    });
  }

  function startSimulator() {
    startQuiz('Simulado aleatório', shuffle(allQuestions()).slice(0, 25));
  }

  function startQuiz(title, questions) {
    currentQuiz = { title, questions, position: 0, score: 0, answered: false };
    renderQuestion();
  }

  function renderQuestion() {
    const question = currentQuiz.questions[currentQuiz.position];
    app.innerHTML = `
      <nav class="quiz-nav"><a href="#" data-action="home">← Todas as provas</a><span>${currentQuiz.title}</span></nav>
      <div class="quiz-progress">Questão ${currentQuiz.position + 1} de ${currentQuiz.questions.length}</div>
      <h1 class="quiz-question">${question.question}</h1>
      <div class="quiz-options">
        ${question.options.map(option => `
          <button class="quiz-option" type="button" data-answer="${option.label}">
            <strong>${option.label}:</strong> ${option.text}
          </button>
        `).join('')}
      </div>
      <div id="quiz-feedback" aria-live="polite"></div>
    `;
    app.querySelector('[data-action="home"]').addEventListener('click', event => {
      event.preventDefault();
      renderHome();
    });
    app.querySelectorAll('[data-answer]').forEach(button => {
      button.addEventListener('click', () => answerQuestion(button.dataset.answer));
    });
  }

  function answerQuestion(answer) {
    if (currentQuiz.answered) return;
    currentQuiz.answered = true;
    const question = currentQuiz.questions[currentQuiz.position];
    const correct = answer === question.correct;
    if (correct) currentQuiz.score += 1;

    app.querySelectorAll('[data-answer]').forEach(button => {
      button.disabled = true;
      if (button.dataset.answer === question.correct) button.classList.add('correct');
      if (button.dataset.answer === answer && !correct) button.classList.add('incorrect');
    });

    const correctOption = question.options.find(option => option.label === question.correct);
    const feedback = app.querySelector('#quiz-feedback');
    feedback.className = 'quiz-feedback';
    feedback.innerHTML = correct
      ? '<strong>Correto!</strong>'
      : `<strong>Resposta incorreta.</strong><br>A resposta certa é <strong>${correctOption.label}: ${correctOption.text}</strong>.`;
    feedback.insertAdjacentHTML('beforeend', `
      <div class="quiz-actions">
        <button class="quiz-button" type="button" data-action="next">
          ${currentQuiz.position + 1 === currentQuiz.questions.length ? 'Ver resultado' : 'Próxima pergunta'}
        </button>
      </div>
    `);
    feedback.querySelector('[data-action="next"]').addEventListener('click', nextQuestion);
  }

  function nextQuestion() {
    if (currentQuiz.position + 1 === currentQuiz.questions.length) {
      renderResult();
      return;
    }
    currentQuiz.position += 1;
    currentQuiz.answered = false;
    renderQuestion();
  }

  function renderResult() {
    const passed = currentQuiz.score >= passingScore;
    app.innerHTML = `
      <nav class="quiz-nav"><a href="#" data-action="home">← Todas as provas</a><span>${currentQuiz.title}</span></nav>
      <div class="quiz-result">
        <div class="eyebrow">Resultado</div>
        <h1>Fim da prova</h1>
        <p class="quiz-score">${currentQuiz.score} de ${currentQuiz.questions.length}</p>
        <p class="${passed ? 'quiz-passed' : 'quiz-failed'}">${passed ? 'Você passou!' : 'Você não passou desta vez.'}</p>
        <p>Para passar, é preciso acertar pelo menos ${passingScore} questões.</p>
        <div class="quiz-actions">
          <button class="quiz-button" type="button" data-action="retry">Refazer</button>
          <button class="quiz-button secondary" type="button" data-action="home">Escolher outra prova</button>
        </div>
      </div>
    `;
    app.querySelectorAll('[data-action="home"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        renderHome();
      });
    });
    app.querySelector('[data-action="retry"]').addEventListener('click', () => {
      startQuiz(currentQuiz.title, currentQuiz.questions);
    });
  }

  renderHome();
})();
