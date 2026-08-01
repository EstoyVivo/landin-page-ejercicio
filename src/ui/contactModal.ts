const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s+()-]{7,20}$/;
const CONTACT_EMAIL = "hugoroldantrabjo@gmail.com";

type FieldName = "name" | "company" | "email" | "phone" | "projectType" | "budget" | "message";

/** The only place validation rules live — real-time feedback on blur/input,
 * and the same rules gate the actual submit. */
function validateField(name: string, value: string): string | null {
  const trimmed = value.trim();
  switch (name as FieldName) {
    case "name":
      return trimmed.length >= 2 ? null : "Escribe tu nombre completo.";
    case "company":
      return trimmed.length >= 2 ? null : "Escribe el nombre de tu empresa.";
    case "email":
      return EMAIL_RE.test(trimmed) ? null : "Escribe un correo válido.";
    case "phone":
      return trimmed === "" || PHONE_RE.test(trimmed) ? null : "Escribe un teléfono válido.";
    case "projectType":
      return trimmed !== "" ? null : "Selecciona el tipo de proyecto.";
    case "budget":
      return trimmed !== "" ? null : "Selecciona un rango de presupuesto.";
    case "message":
      return trimmed.length >= 10 ? null : "Cuéntanos un poco más (mínimo 10 caracteres).";
    default:
      return null;
  }
}

function buildMailto(data: Record<string, string>): string {
  const subject = `Solicitud de propuesta — ${data.company || data.name}`;
  const body = [
    `Nombre completo: ${data.name}`,
    `Empresa: ${data.company}`,
    `Correo electrónico: ${data.email}`,
    `Teléfono: ${data.phone || "No proporcionado"}`,
    `Tipo de proyecto: ${data.projectType}`,
    `Presupuesto estimado: ${data.budget}`,
    "",
    "Mensaje:",
    data.message,
  ].join("\n");

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function initContactModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-contact-modal]");
  const form = document.querySelector<HTMLFormElement>("[data-contact-form]");
  const formView = modal?.querySelector<HTMLElement>("[data-modal-form-view]");
  const successView = modal?.querySelector<HTMLElement>("[data-modal-success-view]");
  if (!modal || !form || !formView || !successView) return;

  const fields = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[name]"),
  );
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const submitLabel = submitBtn?.querySelector("span");

  let lastFocused: HTMLElement | null = null;

  function fieldWrapper(field: Element): HTMLElement | null {
    return field.closest<HTMLElement>(".field");
  }

  function errorElFor(name: string): HTMLElement | null {
    return form!.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
  }

  function runValidation(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
    const message = validateField(field.name, field.value);
    fieldWrapper(field)?.classList.toggle("has-error", !!message);
    const errorEl = errorElFor(field.name);
    if (errorEl) errorEl.textContent = message ?? "";
    return !message;
  }

  function resetView(): void {
    form!.reset();
    fields.forEach((field) => {
      fieldWrapper(field)?.classList.remove("has-error");
      const errorEl = errorElFor(field.name);
      if (errorEl) errorEl.textContent = "";
    });
    formView!.hidden = false;
    successView!.hidden = true;
    if (submitBtn) submitBtn.disabled = false;
    if (submitLabel) submitLabel.textContent = "Enviar solicitud";
  }

  function trapFocus(e: KeyboardEvent): void {
    const focusables = Array.from(modal!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null,
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      closeModal();
    } else if (e.key === "Tab") {
      trapFocus(e);
    }
  }

  function openModal(trigger: HTMLElement | null): void {
    lastFocused = trigger ?? (document.activeElement as HTMLElement | null);
    modal!.classList.add("is-open");
    modal!.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    document.addEventListener("keydown", onKeydown);
    window.setTimeout(() => fields[0]?.focus(), 50);
  }

  function closeModal(): void {
    modal!.classList.remove("is-open");
    modal!.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    document.removeEventListener("keydown", onKeydown);
    lastFocused?.focus();
    window.setTimeout(resetView, 450); // after the panel's own close transition
  }

  document.querySelectorAll<HTMLElement>("[data-open-contact-modal]").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn));
  });

  modal.querySelectorAll<HTMLElement>("[data-modal-close]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  fields.forEach((field) => {
    field.addEventListener("blur", () => runValidation(field));
    // once an error is showing, re-check live as the user types/selects so
    // the message clears the moment the input becomes valid again
    field.addEventListener("input", () => {
      if (fieldWrapper(field)?.classList.contains("has-error")) runValidation(field);
    });
    field.addEventListener("change", () => runValidation(field));
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    let firstInvalid: HTMLElement | null = null;
    fields.forEach((field) => {
      const valid = runValidation(field);
      if (!valid && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      (firstInvalid as HTMLElement).focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;

    if (submitBtn) submitBtn.disabled = true;
    if (submitLabel) submitLabel.textContent = "Abriendo tu correo…";

    window.location.href = buildMailto(data);

    window.setTimeout(() => {
      formView.hidden = true;
      successView.hidden = false;
      successView.querySelector<HTMLElement>("button, a")?.focus();
    }, 500);
  });
}
