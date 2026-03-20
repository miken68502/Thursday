class DecisionContext {
  build(bot, snapshot) {
    const baseAnchor = snapshot.base?.anchor || snapshot.home?.anchor || null;
    const baseDistance = baseAnchor && bot.entity ? bot.entity.position.distanceTo(baseAnchor) : null;

    return {
      bot,
      mode: snapshot.mode,
      activeJob: snapshot.activeJob,
      survival: snapshot.survival,
      inventory: snapshot.inventory,
      home: snapshot.home,
      base: snapshot.base,
      time: bot.time ? bot.time.timeOfDay : 0,
      playerDistance: snapshot.lastKnownPlayerPosition && bot.entity
        ? bot.entity.position.distanceTo(snapshot.lastKnownPlayerPosition)
        : null,
      baseDistance,
      currentJobPriority: snapshot.activeJob?.priority || 0,
      lastProgressAgeMs: Date.now() - snapshot.lastProgressTs,
      snapshot
    };
  }
}

module.exports = { DecisionContext };
