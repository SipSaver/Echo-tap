<file>
<absolute_file_name>/app/frontend/app/game.tsx</absolute_file_name>
<content_replacement>
REPLACE_SECTION
  const onTap = useCallback((x: number, y: number) => {
    if (pausedRef.current || gameOverRef.current) return;
    if (cooldownRef.current > 0) return;

    const c = centerRef.current;
    const dx = x - c.x;
    const dy = y - c.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= CENTER_TAP_RADIUS) {
      // Full wave
      if (!trySpendEnergy(COST_FULL)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      ripples.current.push({ id: nextId.current++, radius: CORE_RADIUS, type: "full" });
      cooldownRef.current = COOLDOWN_FULL_MS;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // play full SFX
      try { fullSoundRef.current?.replayAsync(); } catch {}
    } else {
      // Quadrant
      if (!trySpendEnergy(COST_QUAD)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      const q = getQuadrantFromPoint(x, y);
      const { start, end } = getAnglesForQuadrant(q);
      ripples.current.push({ id: nextId.current++, radius: CORE_RADIUS, type: "quarter", quadrant: q, startAngle: start, endAngle: end });
      cooldownRef.current = COOLDOWN_QUAD_MS;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // play quad SFX
      try { quadSoundRef.current?.replayAsync(); } catch {}
    }
  }, []);
REPLACE_SECTION
</content_replacement>
</file>