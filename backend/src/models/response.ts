// Standard API response envelope (Technical Standards §2).

export type ApiSuccess<T> = {
    success: true;
    data: T;
};

export type ApiFailure = {
    success: false;
    error: {
        code: string;
        message: string;
    };
};

export function success<T>(data: T): ApiSuccess<T> {
    return { success: true, data };
}

export function failure(code: string, message: string): ApiFailure {
    return { success: false, error: { code, message } };
}
