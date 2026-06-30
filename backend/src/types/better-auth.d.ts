export {};

declare module 'better-auth' {
  interface UserAdditionalFields {
    role: 'super_admin' | 'admin' | 'user';
    is_active: boolean;
  }
}
