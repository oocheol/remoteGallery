"use client";

import { useRef } from "react";
import { Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import { observerPose } from "@gallery/three";

type Pose = NonNullable<ReturnType<typeof observerPose>>;
export function ObserverMesh({
  pose,
  heightMm,
  selected,
  onSelect,
}: {
  pose: Pose;
  heightMm: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const group = useRef<Group>(null);
  const eye = new Vector3(...pose.eye);
  useFrame(({ camera }) => {
    if (group.current)
      group.current.visible = camera.position.distanceTo(eye) > 0.3;
  });
  const h = heightMm / 1000;
  const color = selected ? "#397b91" : "#667b83";
  return (
    <group ref={group}>
      <group
        position={pose.position}
        rotation={[0, pose.yaw, 0]}
        scale={h}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.046, 0.02, 0.028]}>
              <boxGeometry args={[0.075, 0.04, 0.13]} />
              <meshStandardMaterial color="#34434a" />
            </mesh>
            <mesh position={[side * 0.046, 0.265, 0]}>
              <capsuleGeometry args={[0.032, 0.4, 6, 12]} />
              <meshStandardMaterial color="#435962" />
            </mesh>
            <mesh
              position={[side * 0.103, 0.65, 0]}
              rotation={[0, 0, side * 0.09]}
            >
              <capsuleGeometry args={[0.024, 0.26, 6, 12]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[side * 0.027, 0.93, 0.063]}>
              <sphereGeometry args={[0.01, 10, 8]} />
              <meshBasicMaterial color="#32caff" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.655, 0]} scale={[1, 1, 0.7]}>
          <capsuleGeometry args={[0.077, 0.22, 8, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 0.835, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.06, 12]} />
          <meshStandardMaterial color="#cfb8a4" />
        </mesh>
        <mesh position={[0, 0.93, 0]}>
          <sphereGeometry args={[0.07, 20, 16]} />
          <meshStandardMaterial color="#cfb8a4" />
        </mesh>
      </group>
      <Html
        position={[
          pose.position[0],
          pose.position[1] + h + 0.13,
          pose.position[2],
        ]}
        center
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <div
          style={{
            background: "#fffffff0",
            border: `1px solid ${selected ? "#397b91" : "#d8deda"}`,
            borderRadius: 6,
            padding: "4px 7px",
            fontSize: 10,
            color: "#29404b",
          }}
        >
          키 {heightMm / 10}cm · 눈 약 {Math.round(heightMm * 0.093 * 10) / 10}
          cm
        </div>
      </Html>
      {selected && (
        <>
          <Line
            points={[pose.eye, pose.target]}
            color="#219abe"
            lineWidth={1.5}
            dashed
            dashSize={0.05}
            gapSize={0.035}
          />
          <Line
            points={[
              [pose.eye[0], pose.position[1] + 0.015, pose.eye[2]],
              [pose.target[0], pose.position[1] + 0.015, pose.target[2]],
            ]}
            color="#397b91"
            lineWidth={2}
          />
          <Html
            position={[
              (pose.eye[0] + pose.target[0]) / 2,
              pose.position[1] + 0.06,
              (pose.eye[2] + pose.target[2]) / 2,
            ]}
            center
            style={{
              pointerEvents: "none",
              whiteSpace: "nowrap",
              fontSize: 11,
              background: "#ffffffe0",
              padding: "3px 6px",
              borderRadius: 4,
            }}
          >
            1m
          </Html>
        </>
      )}
    </group>
  );
}
