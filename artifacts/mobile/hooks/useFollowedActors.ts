import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@netplay_followed_actors";
const NOTIF_KEY = "@netplay_actor_notifications";

export interface FollowedActor {
  name: string;
  initial: string;
  color: string;
}

export function useFollowedActors() {
  const [followedActors, setFollowedActors] = useState<FollowedActor[]>([]);
  const [actorNotifs, setActorNotifs] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(KEY),
      AsyncStorage.getItem(NOTIF_KEY),
    ]).then(([raw, rawNotifs]) => {
      if (raw) setFollowedActors(JSON.parse(raw));
      if (rawNotifs) setActorNotifs(JSON.parse(rawNotifs));
    }).finally(() => setLoaded(true));
  }, []);

  const followActor = useCallback(
    async (actor: FollowedActor) => {
      const isAlready = followedActors.some((a) => a.name === actor.name);
      const next = isAlready
        ? followedActors.filter((a) => a.name !== actor.name)
        : [...followedActors, actor];
      setFollowedActors(next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));

      // Remove notification pref when unfollowing
      if (isAlready) {
        const nextNotifs = { ...actorNotifs };
        delete nextNotifs[actor.name];
        setActorNotifs(nextNotifs);
        await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(nextNotifs));
      }
    },
    [followedActors, actorNotifs]
  );

  const isFollowing = useCallback(
    (name: string) => followedActors.some((a) => a.name === name),
    [followedActors]
  );

  const toggleNotification = useCallback(
    async (actorName: string) => {
      const current = actorNotifs[actorName] ?? false;
      const next = { ...actorNotifs, [actorName]: !current };
      setActorNotifs(next);
      await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(next));
      return !current;
    },
    [actorNotifs]
  );

  const isNotifEnabled = useCallback(
    (actorName: string) => actorNotifs[actorName] ?? false,
    [actorNotifs]
  );

  return { followedActors, followActor, isFollowing, toggleNotification, isNotifEnabled, loaded };
}
