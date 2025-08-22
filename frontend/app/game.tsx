<file>
<absolute_file_name>/app/frontend/app/game.tsx</absolute_file_name>
<content_replacement>
REPLACE_SECTION
          {ripples.current.map((r) => {
            if (r.type === "full") {
              return (
                <Circle key={r.id} cx={center.x} cy={center.y} r={r.radius} stroke={settings.colorFull} strokeOpacity={0.7} strokeWidth={2} fill="none" />
              );
            } else {
              const path = arcStrokePath(center.x, center.y, r.radius, r.startAngle || 0, r.endAngle || 0);
              return <Path key={r.id} d={path} stroke={settings.colorQuarter} strokeOpacity={0.8} strokeWidth={3} fill="none" />;
            }
          })}

          {/* Core */}
          <Circle cx={center.x} cy={center.y} r={CORE_RADIUS} fill={settings.colorCore} />
REPLACE_SECTION
</content_replacement>
</file>