"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Transform.module.css";

type Readiness = "green" | "yellow" | "red";

type Template = {
  focus: string;
  calories: number;
  workout: string[];
  bedtime: string;
};

type DayPlan = Template & {
  date: Date;
  day: number;
  phase: string;
  progression: string;
};

const START_DATE = new Date(2026, 6, 18);
const TOTAL_DAYS = 30;
const PROTEIN = "165 g";
const STEPS = "8–10k";
const WATER = "90–110 oz";
const STORAGE_KEY = "matthew-transform