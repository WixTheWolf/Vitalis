"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Transform.module.css";

type Readiness = "green" | "yellow" | "red";
type Meal = { time: string; title: string; foods: string; protein: string };
type Template = {
  focus: string;
  calories: number;
  bedtime: string;
  workout: string[];
  meals: Meal[];
};
type DayPlan = Template & {
  date: Date;
  day: number;
