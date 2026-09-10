<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="slash-command-menu"
      :style="menuFixedStyle"
      role="listbox"
      :aria-label="commandTitle"
    >
      <div ref="scrollBodyEl" class="slash-command-menu-body">
      <template v-if="filteredSkillItems.length">
        <div class="slash-command-menu-title">{{ skillTitle }}</div>
        <!-- 用 div 作行容器：避免 button 嵌套 button 导致编辑按钮点击偶发失效 -->
        <div
          v-for="(item, index) in filteredSkillItems"
          :key="`skill-${item.id}`"
          :ref="(el: Element | null) => setItemRef(index, el as HTMLElement | null)"
          class="slash-command-item"
          :class="{ active: index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          :title="item.description"
          tabindex="-1"
          @mousedown.prevent
          @mouseenter="onItemHover(index)"
          @click="emit('select', { id: item.skillName ?? item.id, kind: 'skill' })"
        >
          <div class="slash-command-item-row">
            <span class="slash-command-item-name">{{ item.label }}</span>
            <span v-if="item.builtin" class="slash-command-builtin-badge">{{ builtinBadgeLabel }}</span>
            <button
              v-if="item.editable"
              type="button"
              class="slash-command-edit-btn"
              :title="editSkillLabel"
              :aria-label="editSkillLabel"
              @mousedown.prevent.stop="emit('editSkill', item.id)"
              @click.prevent.stop
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
                />
              </svg>
            </button>
          </div>
          <span class="slash-command-item-desc">{{ item.description }}</span>
        </div>
      </template>

      <template v-if="filteredCommandItems.length">
        <div
          class="slash-command-menu-title"
          :class="{ 'slash-command-menu-title--section': filteredSkillItems.length > 0 }"
        >
          {{ commandTitle }}
        </div>
        <button
          v-for="(item, index) in filteredCommandItems"
          :key="`command-${item.id}`"
          :ref="(el: HTMLButtonElement | null) => setItemRef(skillCount + index, el)"
          type="button"
          class="slash-command-item"
          :class="{ active: skillCount + index === activeIndex }"
          role="option"
          :aria-selected="skillCount + index === activeIndex"
          :title="item.description"
          @mousedown.prevent
          @mouseenter="onItemHover(skillCount + index)"
          @click="emit('select', { id: item.id, kind: 'command' })"
        >
          <span class="slash-command-item-name">{{ item.label }}</span>
          <span class="slash-command-item-desc">{{ item.description }}</span>
        </button>
      </template>

      <div v-if="!filteredSkillItems.length && !filteredCommandItems.length" class="slash-command-menu-empty">
        {{ emptyText }}
      </div>
      </div>

      <button
        type="button"
        class="slash-command-add-skill"
        :class="{ active: activeIndex === addSkillFooterIndex }"
        role="option"
        :aria-selected="activeIndex === addSkillFooterIndex"
        @mousedown.prevent="emit('addSkill')"
        @mouseenter="onItemHover(addSkillFooterIndex)"
      >
        <span class="slash-command-add-skill-icon" aria-hidden="true">+</span>
        <span class="slash-command-add-skill-label">{{ addSkillLabel }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { filterSlashCommandItems } from "./slashCommandFilter";
import type { SlashCommandMenuViewItem } from "./types";

export type SlashCommandMenuItem = SlashCommandMenuViewItem;

export type SlashMenuSelectPayload = {
  id: string;
  kind: "skill" | "command";
};

const props = defineProps<{
  visible: boolean;
  skillTitle: string;
  commandTitle: string;
  emptyText?: string;
  addSkillLabel?: string;
  addSkillFooterIndex?: number;
  builtinBadgeLabel?: string;
  editSkillLabel?: string;
  skillItems: SlashCommandMenuItem[];
  commandItems: SlashCommandMenuItem[];
  query: string;
  activeIndex: number;
  /** 仅键盘 ↑↓ 导航时递增，用于触发列表滚动（hover 不滚动） */
  scrollActiveTick?: number;
  /** 输入区锚点，用于 fixed 定位到输入框上方 */
  anchorEl?: HTMLElement | null;
  onHoverIndex?: (index: number) => void;
}>();

const emit = defineEmits<{
  (e: "select", payload: SlashMenuSelectPayload): void;
  (e: "addSkill"): void;
  (e: "editSkill", skillId: string): void;
}>();

const itemRefs = ref<Array<HTMLElement | null>>([]);
const scrollBodyEl = ref<HTMLElement | null>(null);

function setItemRef(index: number, el: HTMLElement | null) {
  itemRefs.value[index] = el;
}

function onItemHover(index: number) {
  props.onHoverIndex?.(index);
}

function scrollActiveItemIntoView() {
  // 固底 footer 不在滚动区内，无需也不应触发滚动
  if (props.activeIndex >= flatItemCount.value) return;

  const el = itemRefs.value[props.activeIndex];
  const container = scrollBodyEl.value;
  if (!el || !container) return;

  const elTop = el.offsetTop;
  const elBottom = elTop + el.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;

  if (elTop < viewTop) {
    container.scrollTop = elTop;
  } else if (elBottom > viewBottom) {
    container.scrollTop = elBottom - container.clientHeight;
  }
}

const positionTick = ref(0);

function bumpPosition() {
  positionTick.value++;
}

const filteredSkillItems = computed(() => filterSlashCommandItems(props.skillItems, props.query));
const filteredCommandItems = computed(() => filterSlashCommandItems(props.commandItems, props.query));
const skillCount = computed(() => filteredSkillItems.value.length);
const flatItemCount = computed(() => skillCount.value + filteredCommandItems.value.length);
const addSkillFooterIndex = computed(() => props.addSkillFooterIndex ?? flatItemCount.value);

watch(
  () => props.query,
  () => {
    itemRefs.value = [];
  },
);

watch(
  () => flatItemCount.value,
  () => {
    itemRefs.value = [];
  },
);

watch(
  () => props.scrollActiveTick,
  () => {
    if (props.visible) void nextTick(scrollActiveItemIntoView);
  },
);

watch(
  () => props.visible,
  (open) => {
    if (open) void nextTick(bumpPosition);
  },
);

watch(
  () => [props.query, props.skillItems.length, props.commandItems.length] as const,
  () => {
    if (props.visible) bumpPosition();
  },
);

onMounted(() => {
  window.addEventListener("resize", bumpPosition);
  window.addEventListener("scroll", bumpPosition, true);
});

onUnmounted(() => {
  window.removeEventListener("resize", bumpPosition);
  window.removeEventListener("scroll", bumpPosition, true);
});

const menuFixedStyle = computed((): CSSProperties => {
  void positionTick.value;
  const el = props.anchorEl;
  if (!el) {
    return { display: "none" };
  }
  const r = el.getBoundingClientRect();
  const top = Math.max(8, r.top - 6);
  return {
    position: "fixed",
    top: `${top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    transform: "translateY(-100%)",
    zIndex: 10001,
  };
});
</script>

<style scoped lang="less">
.slash-command-menu {
  display: flex;
  flex-direction: column;
  max-height: min(320px, 50vh);
  overflow: hidden;
  padding: 4px 0 0;
  border-radius: 10px;
  border: 1px solid var(--stay-border, #37372f);
  background: var(--stay-background, #f8f8f6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
}

.slash-command-menu-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 4px;
}

.slash-command-add-skill {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  margin: 0;
  border: none;
  border-top: 1px solid var(--stay-border, #37372f);
  border-radius: 0 0 10px 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;

  &.active,
  &:hover {
    background: var(--stay-backgroundTertiary, #eeeeee);
  }
}

.slash-command-add-skill-icon {
  flex-shrink: 0;
  width: 14px;
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  color: var(--stay-secondaryFont, #8a8a8a);
  text-align: center;
}

.slash-command-add-skill-label {
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 500;
  color: var(--stay-secondaryFont, #8a8a8a);
  line-height: 1.3;
}

.slash-command-menu-title {
  padding: 6px 12px 0;
  margin-bottom: 6px;
  font-size: var(--stay-text-subbody, 13px);
  font-weight: 700;
  color: var(--stay-black, #2f3134);
  letter-spacing: 0.02em;
  line-height: 1.3;

  &--section {
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--stay-border, #e0e0e0);
  }
}

.slash-command-menu-empty {
  padding: 8px 12px 10px;
  font-size: var(--stay-text-footnote, 12px);
  color: var(--stay-secondaryFont, #8a8a8a);
  line-height: 1.35;
}

.slash-command-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;

  &.active,
  &:hover {
    background: var(--stay-backgroundTertiary, #eeeeee);
  }
}

.slash-command-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.slash-command-item-name {
  flex: 0 1 auto;
  min-width: 0;
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 500;
  color: var(--stay-black, #2f3134);
  line-height: 1.3;
}

.slash-command-builtin-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: var(--stay-text-subfootnote, 10px);
  font-weight: 600;
  line-height: 1.3;
  color: var(--stay-secondaryFont, #8a8a8a);
  background: var(--stay-backgroundSecondary, #fff);
  border: 1px solid var(--stay-border, #e0e0e0);
}

.slash-command-edit-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: auto;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--stay-secondaryFont, #8a8a8a);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;

  svg {
    width: 14px;
    height: 14px;
    display: block;
  }

  &:hover {
    opacity: 1;
    background: var(--stay-backgroundSecondary, #fff);
    color: var(--stay-black, #2f3134);
  }
}

.slash-command-item:hover .slash-command-edit-btn,
.slash-command-item.active .slash-command-edit-btn {
  opacity: 1;
}

.slash-command-item-desc {
  width: 100%;
  font-size: var(--stay-text-subfootnote, 10px);
  color: var(--stay-secondaryFont, #8a8a8a);
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
</style>
