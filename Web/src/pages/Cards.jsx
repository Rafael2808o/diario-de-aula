import { useApp } from "../context.js";
import { Empty } from "../ui.jsx";
import Flashcards from "../components/ai/Flashcards.jsx";

// Cartas do Saber: os mesmos flashcards da área de estudo, com uma entrada própria no menu.
export default function Cards() {
  const { data, go, params } = useApp();
  const exam = params.exam ? data.exams.find((item) => item.id === params.exam) : null;
  // Vindo do Caderno de uma aula: abre já com aquela aula como fonte e filtro.
  const lesson = params.lesson ? data.lessons.find((item) => item.id === params.lesson) : null;
  return (
    <div className="page cards-page">
      <header className="page-head">
        <div>
          <h1>Cartas do Saber</h1>
          <p>Pergunta na frente, resposta no verso. Separe por disciplina, aula e conjunto, e revise o que ainda não sabe.</p>
        </div>
      </header>
      {data.subjects.length ? (
        <section className="tool-panel">
          <Flashcards preset={exam ? { subjectId: exam.subjectId, examId: exam.id } : lesson ? { subjectId: lesson.subjectId, lessonId: lesson.id, mode: params.criar ? "criar" : "" } : data.subjects.some((item) => item.id === params.subject) ? { subjectId: params.subject } : {}} />
        </section>
      ) : (
        <Empty title="Cadastre uma disciplina primeiro.">
          As cartas ficam organizadas por disciplina.
          <button className="btn small" onClick={() => go("conteudos")}>
            Cadastrar disciplina
          </button>
        </Empty>
      )}
    </div>
  );
}
