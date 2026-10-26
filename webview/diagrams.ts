import { renderMath } from './math';

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

export interface DiagramConfig {
  /** The address of the mermaid script. It is 5 MB, so the page loads it only when a diagram needs it. */
  mermaidSrc?: string;
  /** The nonce that the content security policy of the page asks for. */
  nonce?: string;
}

let config: DiagramConfig = {};
let loading: Promise<MermaidApi> | undefined;
let counter = 0;

export function configureDiagrams(next: DiagramConfig): void {
  config = next;
  loading = undefined;
}

function globalMermaid(): MermaidApi | undefined {
  const found = (window as any).mermaid;
  return found?.render ? found : found?.default;
}

function loadMermaid(): Promise<MermaidApi> {
  const present = globalMermaid();
  if (present) {
    return Promise.resolve(present);
  }
  if (!config.mermaidSrc) {
    return Promise.reject(new Error('The diagram library is not available.'));
  }
  loading ??= new Promise<MermaidApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = config.mermaidSrc!;
    if (config.nonce) {
      script.nonce = config.nonce;
    }
    script.onload = () => {
      const api = globalMermaid();
      api ? resolve(api) : reject(new Error('The diagram library did not start.'));
    };
    script.onerror = () => {
      loading = undefined;
      reject(new Error('The diagram library could not be loaded.'));
    };
    document.head.append(script);
  });
  return loading;
}

function isLightTheme(): boolean {
  return document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light');
}

/** Draw a mermaid diagram. It gives the SVG, or throws with the message of mermaid. */
export async function renderMermaid(source: string): Promise<string> {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: isLightTheme() ? 'default' : 'dark',
    fontFamily: 'var(--vscode-font-family, sans-serif)',
  });
  const id = `rme-mermaid-${counter++}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return svg;
  } finally {
    // Mermaid leaves a helper element in the page when a diagram has an error.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
  }
}

/** The languages that a code block can draw as a picture. */
export function isDrawable(language: string): boolean {
  return language === 'mermaid' || language === 'math';
}

/**
 * Draw the source of a code block into an element.
 * It works for the languages `mermaid` and `math`, as on GitHub. It returns false for other languages.
 */
export async function drawInto(target: HTMLElement, language: string, source: string, isCurrent: () => boolean): Promise<boolean> {
  if (!isDrawable(language)) {
    return false;
  }
  if (source.trim() === '') {
    target.replaceChildren();
    target.classList.remove('is-error');
    return true;
  }
  try {
    if (language === 'math') {
      const { html, error } = renderMath(source, true);
      if (error) {
        throw new Error(error);
      }
      if (isCurrent()) {
        target.innerHTML = html;
      }
    } else {
      const svg = await renderMermaid(source);
      if (isCurrent()) {
        target.innerHTML = svg;
      }
    }
    if (isCurrent()) {
      target.classList.remove('is-error');
    }
  } catch (error) {
    if (isCurrent()) {
      target.classList.add('is-error');
      target.textContent = error instanceof Error ? error.message.split('\n')[0] : String(error);
    }
  }
  return true;
}
