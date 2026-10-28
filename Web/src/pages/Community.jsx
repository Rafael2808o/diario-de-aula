import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, PenLine, Plus, Search, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { Avatar, Confirm, Empty, FormError, Modal, useSubmit } from "../ui.jsx";

// Conselho dos Bruxinhos (antigo Quadro de Dúvidas): um único mural para todas as contas. Cada publicação mostra só o nome público do autor.
// A ordem acompanha a API: categorias novas entram no fim.
export const categories = ["Dúvida", "Ideia ou sugestão", "Erro encontrado", "Atualização", "Comentário geral", "Material", "Dica de estudo"];
const shortNames = { "Ideia ou sugestão": "Ideias", "Comentário geral": "Comentários", "Erro encontrado": "Erros", Atualização: "Atualizações", Dúvida: "Dúvidas", Material: "Materiais", "Dica de estudo": "Dicas" };
const filterOrder = ["Dúvida", "Material", "Dica de estudo", "Ideia ou sugestão", "Erro encontrado", "Atualização", "Comentário geral"];

const when = (iso) => {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

const authorUser = (author) => ({ id: author.id, name: author.name, avatarVersion: author.avatarVersion });

export function usePosts(params = {}) {
  const { call } = useApp();
  const [state, setState] = useState({ status: "loading", posts: [] });
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();
  const load = useCallback(async () => {
    try {
      setState((current) => ({ ...current, status: current.posts.length ? "refreshing" : "loading" }));
      setState({ status: "ready", posts: await call(`/community/posts${query ? `?${query}` : ""}`) });
    } catch (failure) {
      setState({ status: "error", posts: [], error: failure.message });
    }
  }, [call, query]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, load };
}

function PostForm({ post, onClose, onSaved }) {
  const { call } = useApp();
  const { submit, busy, error } = useSubmit((body) => call(post ? `/community/posts/${post.id}` : "/community/posts", { method: post ? "PATCH" : "POST", body }), {
    success: post ? "Publicação atualizada." : "Publicado no quadro.",
    onDone: onSaved,
  });
  return (
    <Modal title={post ? "Editar publicação" : "Nova publicação"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        <label>
          Categoria
          <select name="category" defaultValue={post?.category || "Dúvida"}>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Título
          <input name="title" required minLength={3} maxLength={140} defaultValue={post?.title} placeholder="Resuma em uma frase" />
        </label>
        <label>
          Detalhes
          <textarea name="body" rows={6} maxLength={4000} defaultValue={post?.body} placeholder="Conte o contexto. Não compartilhe senhas, documentos ou dados pessoais." />
        </label>
        <p className="hint">Todo mundo que usa a Grimiau vê o quadro. Aparece só o seu primeiro nome e a inicial do sobrenome.</p>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Publicando..." : post ? "Salvar" : "Publicar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PostRow({ post, onOpen }) {
  return (
    <li>
      <button type="button" className="row post-row" onClick={() => onOpen(post)}>
        <Avatar user={authorUser(post.author)} size={34} />
        <span className="row-main">
          <strong>{post.title}</strong>
          <small>
            <span className={`post-category cat-${categories.indexOf(post.category)}`}>{post.category}</span> {post.author.name}, {when(post.createdAt)}
            {post.edited ? ", editado" : ""}
          </small>
        </span>
        <span className="post-count" aria-label={`${post.commentCount} comentários`}>
          <MessageCircle size={14} aria-hidden="true" /> {post.commentCount}
        </span>
      </button>
    </li>
  );
}

function CommentItem({ comment, onChanged }) {
  const { call, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { submit, busy, error } = useSubmit((body) => call(`/community/comments/${comment.id}`, { method: "PATCH", body }), {
    onDone: (post) => {
      setEditing(false);
      onChanged(post);
    },
  });
  return (
    <li className="comment">
      <Avatar user={authorUser(comment.author)} size={30} />
      <div className="comment-body">
        <p className="comment-meta">
          <strong>{comment.author.name}</strong> {when(comment.createdAt)}
          {comment.edited ? ", editado" : ""}
        </p>
        {editing ? (
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              submit({ body: new FormData(event.currentTarget).get("body") });
            }}
          >
            <textarea name="body" rows={3} maxLength={2000} defaultValue={comment.body} required />
            <FormError>{error}</FormError>
            <div className="form-actions">
              <button type="button" className="btn small" onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button className="btn small primary" disabled={busy}>
                Salvar
              </button>
            </div>
          </form>
        ) : (
          <p className="prewrap">{comment.body}</p>
        )}
      </div>
      {comment.mine && !editing && (
        <span className="comment-actions">
          <button type="button" className="icon-btn" aria-label="Editar comentário" onClick={() => setEditing(true)}>
            <PenLine size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Excluir comentário" onClick={() => setDeleting(true)}>
            <Trash2 size={14} />
          </button>
        </span>
      )}
      {deleting && (
        <Confirm
          title="Excluir comentário?"
          message="O comentário sai do quadro para todo mundo."
          onConfirm={async () => {
            await call(`/community/comments/${comment.id}`, { method: "DELETE" });
            toast("Comentário excluído.");
            onChanged(null, comment.id);
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </li>
  );
}

function PostDetail({ id }) {
  const { call, go, toast } = useApp();
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState("loading");
  const [modal, setModal] = useState(null);
  const { submit, busy, error } = useSubmit((body) => call(`/community/posts/${id}/comments`, { method: "POST", body }), {
    onDone: (updated) => {
      setPost(updated);
      document.getElementById("comment-box").value = "";
    },
  });
  useEffect(() => {
    call(`/community/posts/${id}`)
      .then((payload) => {
        setPost(payload);
        setStatus("ready");
      })
      .catch(() => setStatus("missing"));
  }, [call, id]);

  if (status === "loading") return <p className="quiet">Abrindo a publicação...</p>;
  if (status === "missing" || !post)
    return (
      <Empty title="Esta publicação não está mais no quadro.">
        <button className="btn small" onClick={() => go("comunidade")}>
          Voltar ao quadro
        </button>
      </Empty>
    );
  return (
    <article className="post-detail">
      <header className="post-head">
        <Avatar user={authorUser(post.author)} size={42} />
        <div>
          <span className={`post-category cat-${categories.indexOf(post.category)}`}>{post.category}</span>
          <h2>{post.title}</h2>
          <small>
            {post.author.name}, {when(post.createdAt)}
            {post.edited ? ", editado" : ""}
          </small>
        </div>
        {post.mine && (
          <span className="page-actions">
            <button className="btn small" onClick={() => setModal("edit")}>
              <PenLine size={14} /> Editar
            </button>
            <button className="btn small danger-outline" onClick={() => setModal("delete")}>
              Excluir
            </button>
          </span>
        )}
      </header>
      {post.body && <p className="prewrap post-body">{post.body}</p>}
      <section>
        <h3 className="section-title">
          {post.comments.length} {post.comments.length === 1 ? "resposta" : "respostas"}
        </h3>
        {post.comments.length > 0 && (
          <ul className="comments">
            {post.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onChanged={(updated, removedId) => setPost(updated || { ...post, comments: post.comments.filter((item) => item.id !== removedId) })}
              />
            ))}
          </ul>
        )}
        <form
          className="form comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            const body = new FormData(event.currentTarget).get("body");
            if (String(body).trim()) submit({ body });
          }}
        >
          <label>
            Responder
            <textarea id="comment-box" name="body" rows={3} maxLength={2000} required placeholder="Escreva sua resposta" />
          </label>
          <FormError>{error}</FormError>
          <div className="form-actions">
            <button className="btn primary" disabled={busy}>
              {busy ? "Enviando..." : "Responder"}
            </button>
          </div>
        </form>
      </section>
      {modal === "edit" && <PostForm post={post} onClose={() => setModal(null)} onSaved={(updated) => { setPost(updated); setModal(null); }} />}
      {modal === "delete" && (
        <Confirm
          title="Excluir publicação?"
          message="A publicação e as respostas saem do quadro para todo mundo."
          onConfirm={async () => {
            await call(`/community/posts/${post.id}`, { method: "DELETE" });
            toast("Publicação excluída.");
            go("comunidade");
          }}
          onClose={() => setModal(null)}
        />
      )}
    </article>
  );
}

export default function Community() {
  const { params, go } = useApp();
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const { status, posts, error, load } = usePosts({ category, q: search });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="page community">
      <header className="page-head">
        <div>
          <h1>Conselho dos Bruxinhos</h1>
          <p>Um mural para toda a comunidade: dúvidas, respostas, materiais, dicas de estudo e ideias.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Nova publicação
          </button>
        </div>
      </header>

      {params.id ? (
        <>
          <button className="link-btn back" onClick={() => go("comunidade")}>
            <ArrowLeft size={15} /> Conselho
          </button>
          <PostDetail key={params.id} id={params.id} />
        </>
      ) : (
        <>
          <div className="toolbar community-tools">
            <label className="search-field">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar dúvida..." aria-label="Buscar no Conselho" maxLength={80} />
            </label>
            <div className="chip-row" role="group" aria-label="Categoria">
              {[["", "Todas"], ...filterOrder.map((item) => [item, shortNames[item]])].map(([value, label]) => (
                <button key={label} type="button" className={`chip ${category === value ? "active" : ""}`} aria-pressed={category === value} onClick={() => setCategory(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {status === "loading" ? (
            <p className="quiet">Carregando o quadro...</p>
          ) : status === "error" ? (
            <Empty title="Não foi possível abrir o quadro.">
              {error}
              <button className="btn small" onClick={load}>
                Tentar de novo
              </button>
            </Empty>
          ) : posts.length ? (
            <ul className="group">
              {posts.map((post) => (
                <PostRow key={post.id} post={post} onOpen={(item) => go("comunidade", { id: item.id })} />
              ))}
            </ul>
          ) : (
            <Empty title={search || category ? "Nada encontrado com esse filtro." : "Este capítulo do grimório ainda está vazio."}>
              {search || category ? "Tente outra busca ou categoria." : "Seja a primeira pessoa a deixar uma dúvida ou ideia."}
            </Empty>
          )}
        </>
      )}
      {creating && <PostForm onClose={() => setCreating(false)} onSaved={(post) => { setCreating(false); go("comunidade", { id: post.id }); load(); }} />}
    </div>
  );
}
