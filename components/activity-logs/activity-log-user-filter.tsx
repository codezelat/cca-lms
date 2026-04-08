"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export interface ActivityLogUserOption {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
}

interface ActivityLogUserFilterProps {
  value: string;
  onChange: (value: string) => void;
}

const getUserPrimaryLabel = (user: ActivityLogUserOption | null) => {
  if (!user) return "All Users";
  return user.name?.trim() || user.email || "Unknown user";
};

const getUserSecondaryLabel = (user: ActivityLogUserOption | null) => {
  if (!user) return "All roles and statuses";

  const parts = [user.email, user.role, user.status].filter(
    (part): part is string => Boolean(part),
  );

  return parts.join(" • ");
};

export function ActivityLogUserFilter({
  value,
  onChange,
}: ActivityLogUserFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<ActivityLogUserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<ActivityLogUserOption | null>(
    null,
  );
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());
  const searchRequestRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  useEffect(() => {
    if (!open && !value) {
      return;
    }

    const controller = new AbortController();
    const requestId = ++searchRequestRef.current;

    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("limit", "20");
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (value) params.set("selectedUserId", value);

        const response = await fetch(`/api/admin/activity-logs/users?${params}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load users");
        }

        const data = await response.json();
        if (controller.signal.aborted || requestId !== searchRequestRef.current) {
          return;
        }

        setUsers(Array.isArray(data.users) ? data.users : []);
        setSelectedUser(data.selectedUser ?? null);
        setHasMore(Boolean(data.hasMore));
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }

        console.error("Failed to search activity log users:", fetchError);
        setError("Could not load users");
      } finally {
        if (!controller.signal.aborted && requestId === searchRequestRef.current) {
          setIsLoading(false);
        }
      }
    };

    void fetchUsers();

    return () => {
      controller.abort();
    };
  }, [open, value, debouncedSearch]);

  const activeUser = useMemo(() => {
    if (!value) return null;
    return users.find((user) => user.id === value) ?? selectedUser;
  }, [users, selectedUser, value]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const emptyMessage = debouncedSearch
    ? "No matching users"
    : "Type a name or email to narrow results";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 w-full justify-between px-3 text-left font-normal",
            !value && "text-terminal-text-muted",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm text-terminal-text">
              {value && !activeUser ? "Unknown user" : getUserPrimaryLabel(activeUser)}
            </div>
            <div className="truncate font-mono text-xs text-terminal-text-muted">
              {value && !activeUser
                ? "The selected user could not be resolved"
                : getUserSecondaryLabel(activeUser)}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-terminal-text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="border-b border-terminal-green/20 p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-terminal-text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or email..."
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => handleSelect("")}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-mono text-sm transition-colors",
              !value
                ? "bg-terminal-green/10 text-terminal-green"
                : "text-terminal-text hover:bg-terminal-green/10",
            )}
          >
            <div className="min-w-0">
              <div>All Users</div>
              <div className="truncate text-xs text-terminal-text-muted">
                All roles and statuses
              </div>
            </div>
            {!value && <Check className="h-4 w-4 shrink-0" />}
          </button>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 font-mono text-sm text-terminal-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading users...
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center font-mono text-sm text-red-400">
              {error}
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-center">
              <Users className="h-5 w-5 text-terminal-text-muted" />
              <p className="font-mono text-sm text-terminal-text-muted">
                {emptyMessage}
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-1">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelect(user.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-mono text-sm transition-colors",
                    value === user.id
                      ? "bg-terminal-green/10 text-terminal-green"
                      : "text-terminal-text hover:bg-terminal-green/10",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate">{getUserPrimaryLabel(user)}</div>
                    <div className="truncate text-xs text-terminal-text-muted">
                      {getUserSecondaryLabel(user)}
                    </div>
                  </div>
                  {value === user.id && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasMore && (
          <div className="border-t border-terminal-green/20 px-3 py-2 font-mono text-xs text-terminal-text-muted">
            Showing the first 20 matches. Keep typing to narrow the list.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
