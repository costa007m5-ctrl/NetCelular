import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@netplay_followed_actors";

export interface FollowedActor {
  name: string;
  initial: string;
  color: string;
}

export function useFollowedActors() {
  const [followedActors, setFollowedActors] = useState<FollowedActor[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setFollowedActors(JSON.parse(raw));
      })
      .finally(() => setLoaded(true));
  }, []);

  const followActor = useCallback(
    async (actor: FollowedActor) => {
      const isAlready = followedActors.some((a) => a.name === actor.name);
      const next = isAlready
        ? followedActors.filter((a) => a.name !== actor.name)
        : [...followedActors, actor];
      setFollowedActors(next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    },
    [followedActors]
  );

  const isFollowing = useCallback(
    (name: string) => followedActors.some((a) => a.name === name),
    [followedActors]
  );

  return { followedActors, followActor, isFollowing, loaded };
}
