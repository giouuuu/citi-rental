"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/**
 * Search applies as you type — there is no submit button. Feedback comes from
 * the loading bar above the table, and Enter skips the debounce.
 *
 * The input is deliberately uncontrolled: a controlled value fed from server
 * props would clobber characters typed while a response is in flight.
 */
export function ResourceSearchForm({
  defaultQuery,
  onCommit,
  onSearch,
  plural,
}: {
  defaultQuery: string;
  /** Apply immediately — Enter, or clearing the field. */
  onCommit: (value: string) => void;
  /** Apply after the debounce. */
  onSearch: (value: string) => void;
  plural: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = `Search ${plural.toLowerCase()}`;

  // Keep the field in step with the URL on back/forward, but never while the
  // user is typing in it.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    input.value = defaultQuery;
  }, [defaultQuery]);

  const clear = () => {
    const input = inputRef.current;
    if (input) {
      input.value = "";
      input.focus();
    }
    onCommit("");
  };

  return (
    <form
      className="w-full max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        onCommit(inputRef.current?.value.trim() ?? "");
      }}
      role="search"
    >
      <InputGroup className="h-9">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={label}
          defaultValue={defaultQuery}
          name="q"
          onChange={(event) => onSearch(event.target.value.trim())}
          placeholder={`${label}…`}
          ref={inputRef}
          type="search"
        />
        {defaultQuery ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Clear search"
              onClick={clear}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </form>
  );
}
