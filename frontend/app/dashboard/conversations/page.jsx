import { redirect } from 'next/navigation';

export default function ConversationsRedirect({ searchParams }) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') {
          params.append(key, String(item));
        }
      });
      continue;
    }

    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  const target = params.toString()
    ? `/dashboard/chats?${params.toString()}`
    : '/dashboard/chats';

  redirect(target);
}
