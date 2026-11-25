declare global {
    namespace Express {
        interface Request {
            authenticatedEmail?: string;
        }
    }
}

export {};
