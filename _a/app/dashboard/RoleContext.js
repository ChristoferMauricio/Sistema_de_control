"use client";

import { createContext, useContext } from "react";

const RoleContext = createContext("viewer");

export function RoleProvider({ role, children }) {
    return (
        <RoleContext.Provider value={role}>
            {children}
        </RoleContext.Provider>
    );
}

export function useRole() {
    return useContext(RoleContext);
}
