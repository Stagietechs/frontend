import { consume } from "@lit-labs/context";
import { mdiArrowDown, mdiArrowUp, mdiDrag, mdiPlus } from "@mdi/js";
import deepClone from "deep-clone-simple";
import { CSSResultGroup, LitElement, PropertyValues, css, html } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { storage } from "../../../../common/decorators/storage";
import { fireEvent } from "../../../../common/dom/fire_event";
import { nestedArrayMove } from "../../../../common/util/array-move";
import "../../../../components/ha-button";
import "../../../../components/ha-button-menu";
import "../../../../components/ha-sortable";
import "../../../../components/ha-svg-icon";
import { AutomationClipboard, Trigger } from "../../../../data/automation";
import {
  ReorderMode,
  reorderModeContext,
} from "../../../../state/reorder-mode-mixin";
import { HomeAssistant, ItemPath } from "../../../../types";
import {
  PASTE_VALUE,
  showAddAutomationElementDialog,
} from "../show-add-automation-element-dialog";
import "./ha-automation-trigger-row";
import type HaAutomationTriggerRow from "./ha-automation-trigger-row";

@customElement("ha-automation-trigger")
export default class HaAutomationTrigger extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public triggers!: Trigger[];

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Array }) public path?: ItemPath;

  @state()
  @consume({ context: reorderModeContext, subscribe: true })
  private _reorderMode?: ReorderMode;

  @storage({
    key: "automationClipboard",
    state: true,
    subscribe: true,
    storage: "sessionStorage",
  })
  public _clipboard?: AutomationClipboard;

  private _focusLastTriggerOnChange = false;

  private _triggerKeys = new WeakMap<Trigger, string>();

  private get nested() {
    return this.path !== undefined;
  }

  protected render() {
    return html`
      <ha-sortable
        handle-selector=".handle"
        .disabled=${!this._reorderMode?.active}
        @item-moved=${this._triggerMoved}
        group="triggers"
        .path=${this.path}
      >
        <div class="triggers">
          ${repeat(
            this.triggers,
            (trigger) => this._getKey(trigger),
            (trg, idx) => html`
              <ha-automation-trigger-row
                .path=${[...(this.path ?? []), idx]}
                .index=${idx}
                .trigger=${trg}
                .hideMenu=${Boolean(this._reorderMode?.active)}
                @duplicate=${this._duplicateTrigger}
                @value-changed=${this._triggerChanged}
                .hass=${this.hass}
                .disabled=${this.disabled}
              >
                ${this._reorderMode?.active
                  ? html`
                      <ha-icon-button
                        .index=${idx}
                        slot="icons"
                        .label=${this.hass.localize(
                          "ui.panel.config.automation.editor.move_up"
                        )}
                        .path=${mdiArrowUp}
                        @click=${this._moveUp}
                        .disabled=${idx === 0}
                      ></ha-icon-button>
                      <ha-icon-button
                        .index=${idx}
                        slot="icons"
                        .label=${this.hass.localize(
                          "ui.panel.config.automation.editor.move_down"
                        )}
                        .path=${mdiArrowDown}
                        @click=${this._moveDown}
                        .disabled=${idx === this.triggers.length - 1}
                      ></ha-icon-button>
                      <div class="handle" slot="icons">
                        <ha-svg-icon .path=${mdiDrag}></ha-svg-icon>
                      </div>
                    `
                  : ""}
              </ha-automation-trigger-row>
            `
          )}
        </div>
      </ha-sortable>
      <ha-button
        outlined
        .label=${this.hass.localize(
          "ui.panel.config.automation.editor.triggers.add"
        )}
        .disabled=${this.disabled}
        @click=${this._addTriggerDialog}
      >
        <ha-svg-icon .path=${mdiPlus} slot="icon"></ha-svg-icon>
      </ha-button>
    `;
  }

  private _addTriggerDialog() {
    showAddAutomationElementDialog(this, {
      type: "trigger",
      add: this._addTrigger,
      clipboardItem: this._clipboard?.trigger?.platform,
    });
  }

  private _addTrigger = (value: string) => {
    let triggers: Trigger[];
    if (value === PASTE_VALUE) {
      triggers = this.triggers.concat(deepClone(this._clipboard!.trigger));
    } else {
      const platform = value as Trigger["platform"];
      const elClass = customElements.get(
        `ha-automation-trigger-${platform}`
      ) as CustomElementConstructor & {
        defaultConfig: Omit<Trigger, "platform">;
      };
      triggers = this.triggers.concat({
        platform: platform as any,
        ...elClass.defaultConfig,
      });
    }
    this._focusLastTriggerOnChange = true;
    fireEvent(this, "value-changed", { value: triggers });
  };

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (changedProps.has("triggers") && this._focusLastTriggerOnChange) {
      this._focusLastTriggerOnChange = false;

      const row = this.shadowRoot!.querySelector<HaAutomationTriggerRow>(
        "ha-automation-trigger-row:last-of-type"
      )!;
      row.updateComplete.then(() => {
        row.expand();
        row.scrollIntoView();
        row.focus();
      });
    }
  }

  private _getKey(action: Trigger) {
    if (!this._triggerKeys.has(action)) {
      this._triggerKeys.set(action, Math.random().toString());
    }

    return this._triggerKeys.get(action)!;
  }

  private _moveUp(ev) {
    const index = (ev.target as any).index;
    const newIndex = index - 1;
    this._move(index, newIndex);
  }

  private _moveDown(ev) {
    const index = (ev.target as any).index;
    const newIndex = index + 1;
    this._move(index, newIndex);
  }

  private _move(
    oldIndex: number,
    newIndex: number,
    oldPath?: ItemPath,
    newPath?: ItemPath
  ) {
    const triggers = nestedArrayMove(
      this.triggers,
      oldIndex,
      newIndex,
      oldPath,
      newPath
    );

    fireEvent(this, "value-changed", { value: triggers });
  }

  private _triggerMoved(ev: CustomEvent): void {
    if (this.nested) return;
    ev.stopPropagation();
    const { oldIndex, newIndex, oldPath, newPath } = ev.detail;
    this._move(oldIndex, newIndex, oldPath, newPath);
  }

  private _triggerChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const triggers = [...this.triggers];
    const newValue = ev.detail.value;
    const index = (ev.target as any).index;

    if (newValue === null) {
      triggers.splice(index, 1);
    } else {
      // Store key on new value.
      const key = this._getKey(triggers[index]);
      this._triggerKeys.set(newValue, key);

      triggers[index] = newValue;
    }

    fireEvent(this, "value-changed", { value: triggers });
  }

  private _duplicateTrigger(ev: CustomEvent) {
    ev.stopPropagation();
    const index = (ev.target as any).index;
    fireEvent(this, "value-changed", {
      value: this.triggers.concat(deepClone(this.triggers[index])),
    });
  }

  static get styles(): CSSResultGroup {
    return css`
      ha-automation-trigger-row {
        display: block;
        margin-bottom: 16px;
        scroll-margin-top: 48px;
      }
      ha-svg-icon {
        height: 20px;
      }
      ha-alert {
        display: block;
        margin-bottom: 16px;
        border-radius: var(--ha-card-border-radius, 16px);
        overflow: hidden;
      }
      .handle {
        padding: 12px;
        cursor: move; /* fallback if grab cursor is unsupported */
        cursor: grab;
      }
      .handle ha-svg-icon {
        pointer-events: none;
        height: 24px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-trigger": HaAutomationTrigger;
  }
}
