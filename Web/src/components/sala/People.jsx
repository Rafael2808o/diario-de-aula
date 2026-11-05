import { useEffect, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { useApp } from "../../context.js";
import { Avatar } from "../../ui.jsx";

// Escolha de colegas pelo nome (nome público e foto). Usado no perfil acadêmico (agência) e no cadastro do trabalho.
export function PeoplePicker({ value, onChange, max = 29, label = "Buscar colega pelo nome" }) {
  const { call } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    let alive = true;
    const timer = setTimeout(() => {
      call(`/sala/pessoas?q=${encodeURIComponent(query.trim())}`)
        .then((list) => alive && setResults(list))
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [call, query]);
  const chosen = new Set(value.map((person) => person.id));
  return (
    <div className="people-picker">
      <label className="search-field">
        <Search size={15} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={label} aria-label={label} maxLength={60} />
      </label>
      {results.length > 0 && (
        <ul className="people-results">
          {results.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className={`person-chip ${chosen.has(person.id) ? "active" : ""}`}
                aria-pressed={chosen.has(person.id)}
                disabled={!chosen.has(person.id) && value.length >= max}
                onClick={() => onChange(chosen.has(person.id) ? value.filter((item) => item.id !== person.id) : [...value, person])}
              >
                <Avatar user={person} size={26} /> {person.name} {chosen.has(person.id) && <Check size={14} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <PeopleList people={value} onRemove={(person) => onChange(value.filter((item) => item.id !== person.id))} />
    </div>
  );
}

export function PeopleList({ people, onRemove }) {
  if (!people.length) return null;
  return (
    <ul className="people-list">
      {people.map((person) => (
        <li key={person.id}>
          <Avatar user={person} size={30} />
          <span>{person.name}</span>
          {onRemove && (
            <button type="button" className="icon-btn" aria-label={`Tirar ${person.name}`} onClick={() => onRemove(person)}>
              <X size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
