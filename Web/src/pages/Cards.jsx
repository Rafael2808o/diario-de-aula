import { useApp } from "../context.js";
import { Empty } from "../ui.jsx";
import Flashcards from "../components/ai/Flashcards.jsx";

// Cartas do Saber: os mesmos flashcards da área de estudo, com uma entrada própria no menu.
export default function Cards() {
  const { data, go, params } = useApp();
  const exam = params.exam ? data.exams.find((item) => item.id === params.exam) : null;
  return (
    <div className="page cards-page">
      <header className="page-head">
        <div>
          <h1>Cartas do Saber</h1>
          <p>Pergunta na frente, resposta no verso. Separe o que você já sabe do que ainda precisa de revisão.</p>
        </div>
      </header>
      {data.subjects.length ? (
        <section className="tool-panel">
          <Flashcards preset={exam ? { subjectId: exam.subjectId, examId: exam.id } : {}} />
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
