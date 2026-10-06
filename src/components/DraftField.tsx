import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/**
 * Texto que se guarda mientras se escribe (con una pequeña espera) y al salir del campo.
 * Mientras tiene el foco no se deja pisar por los ecos de la base de datos, así no se pierden letras.
 */
function useDraft(value: string, onSave: (v: string) => void, delay = 500) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(value);

  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = () => { clearTimeout(timer.current); if (latest.current !== value) onSave(latest.current); };
  return {
    value: draft,
    onFocus: () => { focused.current = true; },
    onChange: (e: { target: { value: string } }) => {
      latest.current = e.target.value;
      setDraft(e.target.value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onSave(latest.current), delay);
    },
    onBlur: () => { focused.current = false; flush(); },
  };
}

type Common = { value: string; onSave: (v: string) => void };

export function DraftInput({ value, onSave, ...rest }: Common & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input {...rest} {...useDraft(value, onSave)} />;
}

export function DraftTextarea({ value, onSave, ...rest }: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  return <textarea {...rest} {...useDraft(value, onSave)} />;
}
