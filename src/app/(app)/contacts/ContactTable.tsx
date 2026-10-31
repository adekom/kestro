"use client";

import Link from "next/link";
import { useState } from "react";
import { contactName } from "@/lib/domain";
import type { Contact } from "@/lib/types";

export function ContactTable({ contacts }: { contacts: Contact[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? contacts.filter((c) => [contactName(c), c.email, c.company, c.title].some((f) => f.toLowerCase().includes(q)))
    : contacts;

  return (
    <div className="card">
      <div className="border-b border-border p-3">
        <label htmlFor="contact-search" className="sr-only">Search contacts</label>
        <input
          id="contact-search"
          className="input max-w-xs"
          placeholder="Search by name, email or company"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {shown.length === 0 ? (
        <p className="p-4 text-sm text-text-muted">{contacts.length ? "No matching contacts." : "No contacts yet."}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Phone</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-surface-muted">
                <td className="px-3 py-2">
                  <Link className="link font-medium" href={`/contacts/${c.id}`}>{contactName(c)}</Link>
                  {c.userEmail && <span className="ml-2 rounded bg-primary-subtle px-1.5 py-0.5 text-xs text-primary-hover">staff</span>}
                </td>
                <td className="px-3 py-2">{c.company}</td>
                <td className="px-3 py-2 text-text-muted">{c.title}</td>
                <td className="px-3 py-2">{c.email}</td>
                <td className="px-3 py-2 text-text-muted">{c.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
