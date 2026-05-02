'use client';
import { useEffect } from 'react';
export default function DashboardRedirect() {
  useEffect(() => { window.location.href = '/team'; }, []);
  return null;
}
