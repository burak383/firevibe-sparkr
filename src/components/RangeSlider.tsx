import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const THUMB_SIZE = 26;

interface RangeSliderProps {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  step?: number;
  // Smallest allowed gap between the two thumbs (in value units, not px) -
  // keeps them from crossing over each other.
  minGap?: number;
  // Fires continuously while dragging, for live label updates.
  onChange?: (min: number, max: number) => void;
  // Fires once, when the finger lifts - use this to actually save/submit,
  // so a drag doesn't fire dozens of API calls.
  onChangeEnd: (min: number, max: number) => void;
}

// A two-thumb drag slider built on PanResponder (a core React Native API -
// no extra native dependency, so it can't hit the kind of Expo Go / native-
// module version mismatch this project has already run into a few times
// with other packages). Replaces "type min-max as text into a prompt" for
// picking an age range.
export default function RangeSlider({
  min,
  max,
  valueMin,
  valueMax,
  step = 1,
  minGap = 1,
  onChange,
  onChangeEnd,
}: RangeSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [renderMin, setRenderMin] = useState(clampToRange(valueMin));
  const [renderMax, setRenderMax] = useState(clampToRange(valueMax));

  // PanResponder handlers are created once and would otherwise close over
  // whatever `valueMin`/`valueMax` were at that first render - these refs
  // are the live source of truth the gesture callbacks actually read.
  const valuesRef = useRef({ min: renderMin, max: renderMax });
  const dragBaseRef = useRef({ min: renderMin, max: renderMax });
  const draggingRef = useRef(false);

  function clampToRange(v: number) {
    return Math.min(max, Math.max(min, v));
  }

  // If the parent's values change from outside (e.g. the real profile
  // finishes loading after this component's first render) adopt them -
  // but never while the user's finger is actually on a thumb.
  useEffect(() => {
    if (draggingRef.current) return;
    const next = { min: clampToRange(valueMin), max: clampToRange(valueMax) };
    valuesRef.current = next;
    setRenderMin(next.min);
    setRenderMax(next.max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMin, valueMax]);

  const usableWidth = Math.max(1, trackWidth - THUMB_SIZE);

  const valueToPosition = (v: number) => ((v - min) / (max - min)) * usableWidth;

  const roundToStep = (v: number) => Math.round(v / step) * step;

  const deltaToValue = (startValue: number, dx: number) => {
    const deltaValue = (dx / usableWidth) * (max - min);
    return roundToStep(clampToRange(startValue + deltaValue));
  };

  const createResponder = (thumb: 'min' | 'max') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        draggingRef.current = true;
        dragBaseRef.current = { ...valuesRef.current };
      },
      onPanResponderMove: (_evt, gesture) => {
        const base = dragBaseRef.current;
        let next = deltaToValue(base[thumb], gesture.dx);
        if (thumb === 'min') {
          next = Math.min(next, valuesRef.current.max - minGap);
        } else {
          next = Math.max(next, valuesRef.current.min + minGap);
        }
        next = clampToRange(next);
        valuesRef.current = { ...valuesRef.current, [thumb]: next };
        setRenderMin(valuesRef.current.min);
        setRenderMax(valuesRef.current.max);
        onChange?.(valuesRef.current.min, valuesRef.current.max);
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        onChangeEnd(valuesRef.current.min, valuesRef.current.max);
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
      },
    });

  const minResponder = useRef(createResponder('min')).current;
  const maxResponder = useRef(createResponder('max')).current;

  const minX = valueToPosition(renderMin);
  const maxX = valueToPosition(renderMax);

  return (
    <View style={styles.wrapper}>
      <View style={styles.track} onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}>
        <View style={styles.trackBase} />
        <View style={[styles.activeTrack, { left: minX + THUMB_SIZE / 2, width: Math.max(0, maxX - minX) }]} />
        <View style={[styles.thumb, { left: minX }]} {...minResponder.panHandlers} />
        <View style={[styles.thumb, { left: maxX }]} {...maxResponder.panHandlers} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingVertical: 10 },
  track: { height: THUMB_SIZE, justifyContent: 'center' },
  trackBase: {
    position: 'absolute',
    left: THUMB_SIZE / 2,
    right: THUMB_SIZE / 2,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
  },
  activeTrack: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.foreground,
    borderWidth: 3,
    borderColor: colors.primary,
  },
});
