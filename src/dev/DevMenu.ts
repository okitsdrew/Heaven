import {
  deletePreset,
  exportJson,
  getDefault,
  getValue,
  importJson,
  listPresets,
  loadPreset,
  meta,
  Param,
  resetAll,
  savePreset,
  setValue,
} from '../config';

export interface DevAction {
  label: string;
  run: () => void;
}

const css = `
#dev-menu { position: fixed; top: 0; right: 0; width: 340px; max-width: 100vw; height: 100%; overflow-y: auto;
  background: rgba(14, 12, 20, 0.94); color: #d9d2e9; font: 12px/1.4 monospace; box-sizing: border-box;
  padding: 10px 12px 40px; border-left: 1px solid #3a3350; z-index: 10; }
#dev-menu.hidden { display: none; }
#dev-menu h1 { font-size: 14px; margin: 0 0 8px; color: #f2d7a6; display: flex; justify-content: space-between; }
#dev-menu h1 small { color: #8a83a0; font-weight: normal; }
#dev-menu details { border-top: 1px solid #2a2538; padding: 4px 0; }
#dev-menu summary { cursor: pointer; color: #c9b6ff; padding: 2px 0; text-transform: uppercase; letter-spacing: 1px; }
#dev-menu .row { display: grid; grid-template-columns: 1fr 90px 56px 16px; gap: 4px; align-items: center; margin: 3px 0; }
#dev-menu .row.changed label { color: #f2d7a6; }
#dev-menu .row label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#dev-menu input[type=range] { width: 100%; accent-color: #c9b6ff; }
#dev-menu input[type=number], #dev-menu select { width: 100%; box-sizing: border-box; background: #1d1929;
  color: #e9e3f5; border: 1px solid #3a3350; font: inherit; padding: 1px 3px; }
#dev-menu button { background: #2a2538; color: #e9e3f5; border: 1px solid #443c5c; font: inherit; padding: 3px 7px;
  cursor: pointer; margin: 2px 2px 2px 0; }
#dev-menu button:hover { background: #3a3350; }
#dev-menu .reset { visibility: hidden; padding: 0; margin: 0; border: none; background: none; color: #8a83a0; }
#dev-menu .row.changed .reset { visibility: visible; }
#dev-menu .bar { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 6px; align-items: center; }
#dev-menu .bar select { flex: 1; min-width: 100px; }
#dev-toggle { position: fixed; left: 8px; bottom: 8px; z-index: 11; background: rgba(42, 37, 56, 0.6); color: #c9b6ff;
  border: 1px solid #443c5c; font: 11px monospace; padding: 3px 6px; cursor: pointer; }
`;

function labelFor(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase();
}

export class DevMenu {
  private root: HTMLDivElement;
  private refreshers: (() => void)[] = [];
  private presetSelect!: HTMLSelectElement;

  constructor(actions: DevAction[]) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'dev-menu';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);

    const toggle = document.createElement('button');
    toggle.id = 'dev-toggle';
    toggle.textContent = 'DEV';
    toggle.addEventListener('click', () => this.toggle());
    document.body.appendChild(toggle);

    this.root.addEventListener('click', (e) => {
      // Drop focus after clicking so Space (dash) doesn't re-click the button.
      if (e.target instanceof HTMLButtonElement) e.target.blur();
    });
    this.root.addEventListener('change', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && (t.type === 'range' || t.type === 'checkbox')) t.blur();
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.toggle(false);
    });

    this.build(actions);
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  toggle(force?: boolean): void {
    const show = force ?? !this.open;
    this.root.classList.toggle('hidden', !show);
    if (show) this.refreshAll();
    else (document.activeElement as HTMLElement | null)?.blur();
  }

  private build(actions: DevAction[]): void {
    const title = document.createElement('h1');
    title.innerHTML = 'Dev menu <small>` to close</small>';
    this.root.appendChild(title);

    const presets = this.bar();
    this.presetSelect = document.createElement('select');
    presets.append(
      this.presetSelect,
      this.button('Load', () => {
        if (this.presetSelect.value) loadPreset(this.presetSelect.value);
        this.refreshAll();
      }),
      this.button('Save as', () => {
        const name = prompt('Preset name', this.presetSelect.value || 'preset');
        if (!name) return;
        savePreset(name);
        this.refreshPresets(name);
      }),
      this.button('Delete', () => {
        if (this.presetSelect.value && confirm(`Delete preset "${this.presetSelect.value}"?`)) {
          deletePreset(this.presetSelect.value);
          this.refreshPresets();
        }
      }),
    );

    const io = this.bar();
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.style.display = 'none';
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      this.tryImport(await f.text());
    });
    io.append(
      file,
      this.button('Export', () => {
        const json = exportJson();
        navigator.clipboard?.writeText(json).catch(() => {});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = 'heaven-config.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }),
      this.button('Import file', () => file.click()),
      this.button('Paste JSON', () => {
        const text = prompt('Paste config JSON');
        if (text) this.tryImport(text);
      }),
      this.button('Reset all', () => {
        if (!confirm('Reset every config value to its default?')) return;
        resetAll();
        this.refreshAll();
      }),
    );

    const actionBar = this.section('actions', true);
    for (const a of actions) actionBar.appendChild(this.button(a.label, a.run));

    for (const [section, params] of Object.entries(meta)) {
      const body = this.section(section, section !== 'render');
      for (const [key, param] of Object.entries(params as Record<string, Param>)) {
        body.appendChild(this.row(section, key, param));
      }
    }
    this.refreshPresets();
  }

  private tryImport(text: string): void {
    try {
      importJson(text);
      this.refreshAll();
    } catch {
      alert('That is not valid config JSON.');
    }
  }

  private bar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'bar';
    this.root.appendChild(bar);
    return bar;
  }

  private section(name: string, open: boolean): HTMLElement {
    const details = document.createElement('details');
    details.open = open;
    const summary = document.createElement('summary');
    summary.textContent = name;
    details.appendChild(summary);
    this.root.appendChild(details);
    return details;
  }

  private button(label: string, run: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', run);
    return b;
  }

  private row(section: string, key: string, param: Param): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.textContent = labelFor(key);
    label.title = `${section}.${key}`;
    const reset = this.button('↺', () => {
      setValue(section, key, getDefault(section, key));
      refresh();
    });
    reset.className = 'reset';
    reset.title = `Default: ${getDefault(section, key)}`;

    let refresh: () => void;
    if (param === 'bool') {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.addEventListener('change', () => {
        setValue(section, key, box.checked);
        refresh();
      });
      row.append(label, box, document.createElement('span'), reset);
      refresh = () => {
        box.checked = getValue(section, key) as boolean;
        row.classList.toggle('changed', box.checked !== getDefault(section, key));
      };
    } else {
      const slider = document.createElement('input');
      slider.type = 'range';
      const num = document.createElement('input');
      num.type = 'number';
      for (const el of [slider, num]) {
        el.min = String(param.min);
        el.max = String(param.max);
        el.step = String(param.step);
      }
      // The number field accepts values beyond the slider range.
      num.removeAttribute('min');
      num.removeAttribute('max');
      num.step = 'any';
      slider.addEventListener('input', () => {
        setValue(section, key, Number(slider.value));
        refresh();
      });
      num.addEventListener('change', () => {
        const v = Number(num.value);
        if (Number.isFinite(v)) setValue(section, key, v);
        refresh();
      });
      row.append(label, slider, num, reset);
      refresh = () => {
        const v = getValue(section, key) as number;
        slider.value = String(v);
        if (document.activeElement !== num) num.value = String(Math.round(v * 1e4) / 1e4);
        row.classList.toggle('changed', v !== getDefault(section, key));
      };
    }
    refresh();
    this.refreshers.push(refresh);
    return row;
  }

  private refreshAll(): void {
    for (const r of this.refreshers) r();
  }

  private refreshPresets(select?: string): void {
    const current = select ?? this.presetSelect.value;
    this.presetSelect.innerHTML = '';
    const names = Object.keys(listPresets());
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = names.length ? '(choose preset)' : '(no presets yet)';
    this.presetSelect.appendChild(empty);
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      this.presetSelect.appendChild(opt);
    }
    if (names.includes(current)) this.presetSelect.value = current;
  }
}
