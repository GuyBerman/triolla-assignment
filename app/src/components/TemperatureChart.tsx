import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { Excursion, Gap, Reading } from '../api/types';
import { formatDayAndTime, formatTime } from '../format';
import { colors } from '../theme';

const PADDING = { top: 10, right: 10, bottom: 22, left: 34 };
const DEFAULT_HEIGHT = 220;

interface Props {
  readings: Reading[];
  thresholdC: number;
  gaps: Gap[];
  excursions: Excursion[];
  height?: number;
}

interface Point {
  t: number;
  v: number;
}

/**
 * Splits the series wherever the analysis reported a hole.
 *
 * This is the whole reason the chart is hand-rolled rather than handed to a
 * charting library: by default they join the points either side of a gap with
 * a straight line, which draws a fridge that was quietly unmonitored for two
 * hours as a fridge that was comfortably cold the whole time.
 */
function toSegments(readings: Reading[], gaps: Gap[]): Point[][] {
  const gapStarts = new Set(gaps.map((gap) => gap.startedAt));
  const segments: Point[][] = [];
  let current: Point[] = [];

  for (const reading of readings) {
    // A failed reading is not a temperature, so it contributes no point - but
    // it does not break the line either; only a real gap does.
    if (reading.tempC !== null) {
      current.push({ t: new Date(reading.recordedAt).getTime(), v: reading.tempC });
    }

    if (gapStarts.has(reading.recordedAt) && current.length > 0) {
      segments.push(current);
      current = [];
    }
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

export function TemperatureChart({
  readings,
  thresholdC,
  gaps,
  excursions,
  height = DEFAULT_HEIGHT,
}: Props) {
  const [width, setWidth] = useState(0);

  const segments = toSegments(readings, gaps);
  const points = segments.flat();

  if (width === 0 || points.length === 0) {
    return <View style={[styles.container, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} />;
  }

  const times = readings.map((reading) => new Date(reading.recordedAt).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const temps = points.map((point) => point.v);
  // The limit is always on screen, so "how far above five was it" is readable
  // even when every reading is comfortably below it.
  const minV = Math.min(...temps, thresholdC) - 1;
  const maxV = Math.max(...temps, thresholdC) + 1;

  const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const plotHeight = Math.max(1, height - PADDING.top - PADDING.bottom);

  const x = (t: number) =>
    PADDING.left + (maxT === minT ? plotWidth / 2 : ((t - minT) / (maxT - minT)) * plotWidth);
  const y = (v: number) =>
    PADDING.top + (maxV === minV ? plotHeight / 2 : ((maxV - v) / (maxV - minV)) * plotHeight);

  const path = (segment: Point[]) =>
    segment
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`)
      .join(' ');

  const yTicks = [minV, (minV + maxV) / 2, maxV];
  const xTicks = [minT, (minT + maxT) / 2, maxT];
  // Over more than a day, a bare "18:00" appears twice and means nothing.
  const spansMultipleDays = maxT - minT > 26 * 3_600_000;
  const xLabel = (time: number) => {
    const iso = new Date(time).toISOString();
    return spansMultipleDays ? formatDayAndTime(iso) : formatTime(iso);
  };

  return (
    <View
      style={[styles.container, { height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Svg width={width} height={height}>
        {/* Periods above the limit, behind everything else. */}
        {excursions.map((excursion) => {
          const startX = x(new Date(excursion.startedAt).getTime());
          const endX = x(new Date(excursion.endedAt ?? new Date(maxT).toISOString()).getTime());
          return (
            <Rect
              key={`exc-${excursion.startedAt}`}
              x={startX}
              y={PADDING.top}
              width={Math.max(2, endX - startX)}
              height={plotHeight}
              fill={colors.alarmSoft}
            />
          );
        })}

        {/* Holes in the record, drawn as explicitly empty rather than skipped. */}
        {gaps.map((gap) => {
          const startX = x(new Date(gap.startedAt).getTime());
          const endX = x(new Date(gap.endedAt).getTime());
          return (
            <Rect
              key={`gap-${gap.startedAt}`}
              x={startX}
              y={PADDING.top}
              width={Math.max(2, endX - startX)}
              height={plotHeight}
              fill={colors.noDataSoft}
            />
          );
        })}

        {yTicks.map((value) => (
          <Line
            key={`grid-${value}`}
            x1={PADDING.left}
            y1={y(value)}
            x2={width - PADDING.right}
            y2={y(value)}
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}

        {/* The five-degree line Summer and the inspector both care about. */}
        <Line
          x1={PADDING.left}
          y1={y(thresholdC)}
          x2={width - PADDING.right}
          y2={y(thresholdC)}
          stroke={colors.alarm}
          strokeWidth={1.5}
          strokeDasharray="5,4"
        />

        {segments.map((segment, index) => (
          <Path
            key={`seg-${index}`}
            d={path(segment)}
            stroke={colors.accent}
            strokeWidth={1.8}
            fill="none"
          />
        ))}

        {/* A lone reading would otherwise be an invisible zero-length path. */}
        {segments
          .filter((segment) => segment.length === 1)
          .map((segment, index) => (
            <Circle
              key={`dot-${index}`}
              cx={x(segment[0]!.t)}
              cy={y(segment[0]!.v)}
              r={2.5}
              fill={colors.accent}
            />
          ))}

        {yTicks.map((value) => (
          <SvgText
            key={`ylabel-${value}`}
            x={PADDING.left - 5}
            y={y(value) + 3}
            fontSize={9}
            fill={colors.textMuted}
            textAnchor="end"
          >
            {value.toFixed(0)}
          </SvgText>
        ))}

        {xTicks.map((time, index) => (
          <SvgText
            key={`xlabel-${time}`}
            x={x(time)}
            y={height - 6}
            fontSize={9}
            fill={colors.textMuted}
            textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {xLabel(time)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
