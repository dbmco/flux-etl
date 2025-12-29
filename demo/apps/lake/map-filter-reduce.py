# // map
def starts_with_A(s):
    return s[0] == "A"
fruit = ["Apple", "Banana", "Pear", "Apricot", "Orange"]
map_object = map(starts_with_A, fruit)
print(list(map_object))

# // lambda map
fruit = ["Apple", "Banana", "Pear", "Apricot", "Orange"]
map_object = map(lambda s: s[0] == "A", fruit)
# print(list(map_object))

# // alternative output
for value in map_object:
    print(value)

# // filter
def starts_with_A(s):
    return s[0] == "A"
fruit = ["Apple", "Banana", "Pear", "Apricot", "Orange"]
filter_object = filter(starts_with_A, fruit)
print(list(filter_object))

# // lambda filter
fruit = ["Apple", "Banana", "Pear", "Apricot", "Orange"]
filter_object = filter(lambda s: s[0] == "A", fruit)
print(list(filter_object))

# // reduce via functools
from functools import reduce
def add(x, y):
    return x + y
list = [2, 4, 7, 3]
print(reduce(add, list))