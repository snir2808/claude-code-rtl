/**
 * A stand-in for the `vscode` module with just what src/extension.ts uses, so
 * activate() can run under mocha; src/test/setup.ts points require('vscode')
 * here. The `fake` export is the test side: it resets the state, answers
 * toasts, fires events and records what the extension did.
 */

type Listener<T> = (event: T) => unknown;

class FakeEvent<T> {
  private readonly listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>): { dispose(): void } => {
    this.listeners.add(listener);
    return { dispose: () => void this.listeners.delete(listener) };
  };

  /** Calls every listener; resolves once the promises they return have settled. */
  async fire(event: T): Promise<void> {
    await Promise.allSettled([...this.listeners].map((listener) => listener(event)));
  }

  get size(): number {
    return this.listeners.size;
  }
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export class FakeStatusBarItem {
  text = '';
  tooltip: string | undefined;
  name: string | undefined;
  command: string | undefined;
  visible = false;
  disposed = false;

  constructor(
    readonly id: string | undefined,
    readonly alignment: StatusBarAlignment | undefined,
    readonly priority: number | undefined
  ) {}

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  dispose(): void {
    this.disposed = true;
    this.visible = false;
  }
}

export interface FakeMessage {
  kind: 'info' | 'warning' | 'error';
  text: string;
  items: string[];
}

/** Picks the button the user clicks for a toast; undefined is a dismissal. */
export type Answer = (message: FakeMessage) => string | undefined | Promise<string | undefined>;

export interface FakeExtension {
  extensionPath: string;
  packageJSON: { version: string };
}

type Handler = (...args: unknown[]) => unknown;

function freshState() {
  return {
    items: [] as FakeStatusBarItem[],
    messages: [] as FakeMessage[],
    commands: new Map<string, Handler>(),
    executed: [] as string[],
    answer: (() => undefined) as Answer,
    claudeCode: undefined as FakeExtension | undefined,
    windowState: new FakeEvent<{ focused: boolean }>(),
    extensionsChanged: new FakeEvent<void>(),
  };
}

let current = freshState();

async function show(kind: FakeMessage['kind'], text: string, items: string[]): Promise<string | undefined> {
  const message = { kind, text, items };
  current.messages.push(message);
  return current.answer(message);
}

export const window = {
  state: { focused: true },
  createStatusBarItem(...args: unknown[]): FakeStatusBarItem {
    // (id, alignment, priority) or the older (alignment, priority).
    const [id, alignment, priority] = typeof args[0] === 'string' ? args : [undefined, ...args];
    const item = new FakeStatusBarItem(
      id as string | undefined,
      alignment as StatusBarAlignment | undefined,
      priority as number | undefined
    );
    current.items.push(item);
    return item;
  },
  onDidChangeWindowState: (listener: Listener<{ focused: boolean }>) => current.windowState.event(listener),
  showInformationMessage: (text: string, ...items: string[]) => show('info', text, items),
  showWarningMessage: (text: string, ...items: string[]) => show('warning', text, items),
  showErrorMessage: (text: string, ...items: string[]) => show('error', text, items),
};

export const commands = {
  registerCommand(id: string, handler: Handler): { dispose(): void } {
    if (current.commands.has(id)) {
      throw new Error(`command '${id}' already exists`);
    }
    current.commands.set(id, handler);
    return { dispose: () => void current.commands.delete(id) };
  },
  async executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
    current.executed.push(id);
    return current.commands.get(id)?.(...args);
  },
};

export const extensions = {
  getExtension: (id: string): FakeExtension | undefined =>
    id === 'anthropic.claude-code' ? current.claudeCode : undefined,
  onDidChange: (listener: Listener<void>) => current.extensionsChanged.event(listener),
};

export const fake = {
  /** Forgets everything: items, messages, commands, listeners, answers and Claude Code. */
  reset(): void {
    current = freshState();
    window.state.focused = true;
  },
  get items(): FakeStatusBarItem[] {
    return current.items;
  },
  get messages(): FakeMessage[] {
    return current.messages;
  },
  /** Ids passed to executeCommand, in order (the extension's own and the tests'). */
  get executed(): string[] {
    return current.executed;
  },
  get commandIds(): string[] {
    return [...current.commands.keys()];
  },
  get listenerCount(): number {
    return current.windowState.size + current.extensionsChanged.size;
  },
  answer(answer: Answer): void {
    current.answer = answer;
  },
  /** The Claude Code extension VS Code reports, or undefined when it is not installed. */
  setClaudeCode(extension: FakeExtension | undefined): void {
    current.claudeCode = extension;
  },
  /** Sets window.state.focused and fires onDidChangeWindowState. */
  focus(focused: boolean): Promise<void> {
    window.state.focused = focused;
    return current.windowState.fire({ focused });
  },
  /** Fires extensions.onDidChange; resolves once the listeners' promises have settled. */
  extensionsChanged(): Promise<void> {
    return current.extensionsChanged.fire();
  },
};
