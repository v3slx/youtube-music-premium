import { computed, inject, onScopeDispose, provide, reactive, ref, watchEffect } from "vue";
import type { InjectionKey, Ref } from "vue";

type SearchEntry = { name: string; description?: string };
type RegisteredEntry = SearchEntry & { section: number };
type SearchContext = {
  query: Ref<string>;
  entries: Map<symbol, RegisteredEntry>;
};

const searchKey: InjectionKey<SearchContext> = Symbol("settings-search");
const sectionKey: InjectionKey<number> = Symbol("settings-section");

export function searchTerms(query: string): string[] {
  return [...new Set(query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean))];
}

function matchesEntry(entry: SearchEntry, query: string): boolean {
  const text = `${entry.name} ${entry.description ?? ""}`.toLocaleLowerCase();
  return searchTerms(query).every(term => text.includes(term));
}

export function provideSettingsSearch() {
  const query = ref("");
  const entries = reactive(new Map<symbol, RegisteredEntry>());
  provide(searchKey, { query, entries });

  const searching = computed(() => searchTerms(query.value).length > 0);
  const counts = computed(() => {
    const result = new Map<number, number>();
    for (const entry of entries.values()) {
      if (matchesEntry(entry, query.value)) result.set(entry.section, (result.get(entry.section) ?? 0) + 1);
    }
    return result;
  });
  const resultCount = computed(() => [...counts.value.values()].reduce((sum, count) => sum + count, 0));

  return { query, searching, counts, resultCount };
}

export function provideSettingsSection(section: number) {
  provide(sectionKey, section);
}

export function useSettingSearch(entry: () => SearchEntry) {
  const context = inject(searchKey, undefined);
  const section = inject(sectionKey, undefined);
  const query = context?.query ?? ref("");

  if (context && section !== undefined) {
    const id = Symbol("setting");
    watchEffect(() => context.entries.set(id, { ...entry(), section }));
    onScopeDispose(() => context.entries.delete(id));
  }

  return { query, matches: computed(() => matchesEntry(entry(), query.value)) };
}
