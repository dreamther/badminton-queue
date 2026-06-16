import os

def update_app_tsx():
    filepath = "App.tsx"
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Replace the Queue Area row overflow-hidden container
    old_row_container = '<div className="flex-1 flex items-center gap-3 min-w-0 overflow-hidden">'
    new_row_container = '<div className="flex-1 flex items-center gap-3 min-w-0">'

    # 2. Update Rest Area selected bubble button color (purple-600 -> indigo-700)
    old_rest_button = 'className="w-6 h-6 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg border border-purple-500 shadow-purple-500/20 transition-all"'
    new_rest_button = 'className="w-6 h-6 rounded-full bg-indigo-700 hover:bg-indigo-600 text-white flex items-center justify-center shadow-lg border border-indigo-600 shadow-indigo-500/20 transition-all"'

    # 3. Update Queue Area selected bubble buttons (indigo-600/purple-600 -> indigo-700)
    old_queue_coffee = 'className="w-6 h-6 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg border border-indigo-500 shadow-indigo-500/20 transition-all"'
    new_queue_coffee = 'className="w-6 h-6 rounded-full bg-indigo-700 hover:bg-indigo-600 text-white flex items-center justify-center shadow-lg border border-indigo-600 shadow-indigo-500/20 transition-all"'

    old_queue_logout = 'className="w-6 h-6 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg border border-purple-500 shadow-purple-500/20 transition-all"'
    new_queue_logout = 'className="w-6 h-6 rounded-full bg-indigo-700 hover:bg-indigo-600 text-white flex items-center justify-center shadow-lg border border-indigo-600 shadow-indigo-500/20 transition-all"'

    content_norm = content.replace("\r\n", "\n")

    # Perform replacements
    if old_row_container in content_norm:
        content_norm = content_norm.replace(old_row_container, new_row_container)
        print("Queue row overflow-hidden successfully removed in App.tsx!")
    else:
        print("Warning: Queue row overflow-hidden container NOT found in App.tsx!")

    if old_rest_button in content_norm:
        content_norm = content_norm.replace(old_rest_button, new_rest_button)
        print("Rest Area bubble button color successfully updated in App.tsx!")
    else:
        print("Warning: Rest Area bubble button NOT found in App.tsx!")

    # Replace Coffee button in Queue Area
    if old_queue_coffee in content_norm:
        content_norm = content_norm.replace(old_queue_coffee, new_queue_coffee)
        print("Queue Area Coffee button color successfully updated in App.tsx!")
    else:
        print("Warning: Queue Area Coffee button NOT found in App.tsx!")

    # Replace LogOut button in Queue Area
    if old_queue_logout in content_norm:
        content_norm = content_norm.replace(old_queue_logout, new_queue_logout)
        print("Queue Area LogOut button color successfully updated in App.tsx!")
    else:
        print("Warning: Queue Area LogOut button NOT found in App.tsx!")

    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        f.write(content_norm)

def update_court_card_tsx():
    filepath = "components/CourtCard.tsx"
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Update Court Area selected bubble buttons (indigo-600/purple-600 -> indigo-700)
    old_court_coffee = 'className="w-6 h-6 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg border border-indigo-500 shadow-indigo-500/20 transition-all"'
    new_court_coffee = 'className="w-6 h-6 rounded-full bg-indigo-700 hover:bg-indigo-600 text-white flex items-center justify-center shadow-lg border border-indigo-600 shadow-indigo-500/20 transition-all"'

    old_court_logout = 'className="w-6 h-6 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg border border-purple-500 shadow-purple-500/20 transition-all"'
    new_court_logout = 'className="w-6 h-6 rounded-full bg-indigo-700 hover:bg-indigo-600 text-white flex items-center justify-center shadow-lg border border-indigo-600 shadow-indigo-500/20 transition-all"'

    content_norm = content.replace("\r\n", "\n")

    if old_court_coffee in content_norm:
        content_norm = content_norm.replace(old_court_coffee, new_court_coffee)
        print("Court Card Coffee button color successfully updated in CourtCard.tsx!")
    else:
        print("Warning: Court Card Coffee button NOT found in CourtCard.tsx!")

    if old_court_logout in content_norm:
        content_norm = content_norm.replace(old_court_logout, new_court_logout)
        print("Court Card LogOut button color successfully updated in CourtCard.tsx!")
    else:
        print("Warning: Court Card LogOut button NOT found in CourtCard.tsx!")

    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        f.write(content_norm)

if __name__ == "__main__":
    update_app_tsx()
    update_court_card_tsx()
