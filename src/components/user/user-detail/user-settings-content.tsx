"use client";

import type { BasicUserWithLastLogin } from "app-types/user";
import { fetcher } from "lib/utils";
import React from "react";
import useSWR from "swr";
import { UserDetail } from "./user-detail";
import { UserDetailContentSkeleton } from "./user-detail-content-skeleton";

type SettingsContext = {
  currentUserId: string;
  user: BasicUserWithLastLogin;
  userAccountInfo: { hasPassword: boolean; oauthProviders: string[] };
};

export function UserSettingsContent() {
  const { data } = useSWR<SettingsContext>(
    "/api/user/settings-context",
    fetcher,
  );

  if (!data?.user) return <UserDetailContentSkeleton />;

  return (
    <UserDetail
      view="user"
      user={data.user}
      currentUserId={data.currentUserId}
      userAccountInfo={data.userAccountInfo}
    />
  );
}
