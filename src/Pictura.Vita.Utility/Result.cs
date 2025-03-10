namespace Pictura.Vita.Utility;

public static class Results
{
    public static Result Success => new();
}

public class Result
{
    public bool IsSuccess { get; }

    public bool IsFaulted => !IsSuccess;

    public Exception Exception =>
        IsFaulted
            ? _exception!
            : throw new InvalidOperationException("Cannot access exception for successful result");

    private readonly Exception? _exception;

    public Result()
    {
        IsSuccess = true;
    }

    public Result(Exception exception)
    {
        _exception = exception;
        IsSuccess = false;
    }

    public static implicit operator Result(Exception exception) => new(exception);
}

public class Result<T>
{
    public bool IsSuccess { get; }

    public bool IsFaulted => !IsSuccess;

    public T Value =>
        IsSuccess
            ? _value!
            : throw new InvalidOperationException("Cannot access value for faulted result");

    private readonly T? _value;

    public Exception Exception =>
        IsFaulted
            ? _exception!
            : throw new InvalidOperationException("Cannot access exception for successful result");

    private readonly Exception? _exception;

    public Result(T value)
    {
        _value = value;
        IsSuccess = true;
    }

    public Result(Exception exception)
    {
        _exception = exception;
        IsSuccess = false;
    }

    public static implicit operator Result<T>(T value) => new(value);

    public static implicit operator Result<T>(Exception exception) => new(exception);
}